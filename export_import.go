package main

import (
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime/debug"
	"strings"
	"time"

	"golang.org/x/crypto/argon2"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Password-protected, offline export/import of the server inventory.
//
// The exported .zdsv file is a base64-encoded blob with the layout:
//
//	"ZDVAULT" (7 bytes) | version (1 byte) | salt (16 bytes) | AES-256-GCM(nonce || ciphertext+tag)
//
// The key is derived from the user's password with Argon2id; the header
// bytes are bound as GCM additional data, so any tampering with the magic,
// version or salt makes decryption fail. The file never leaves the machine
// (native save/open dialogs only) - no network, no cloud, zero telemetry.

const (
	exportMagic         = "ZDVAULT"
	exportVersion       = 1
	exportSaltLen       = 16
	exportFileExt       = ".zdsv"
	exportMinPassLength = 8

	// Argon2id, RFC 9106 first recommended option (t=3, m=32 MiB, p=4).
	argonTime    = 3
	argonMemory  = 32 * 1024 // KiB
	argonThreads = 4
	// The app caps the Go heap with GOMEMLIMIT (~14 MiB). Argon2id needs a
	// 32 MiB scratch area, so the soft limit is raised for the one-shot KDF
	// (otherwise the GC thrashes against the allocation) and restored after.
	kdfMemLimit = 96 << 20
)

// exportPayload is the JSON document encrypted inside a .zdsv file.
type exportPayload struct {
	Version    int            `json:"version"`
	ExportedAt time.Time      `json:"exportedAt"`
	Servers    []ServerConfig `json:"servers"`
}

// ImportSummary reports what an import changed (all counts, cancelled
// included, so the UI can stay silent when the user just closes the dialog).
type ImportSummary struct {
	Added     int  `json:"added"`
	Updated   int  `json:"updated"`
	Cancelled bool `json:"cancelled"`
}

func deriveExportKey(password string, salt []byte) []byte {
	prev := debug.SetMemoryLimit(kdfMemLimit)
	defer debug.SetMemoryLimit(prev)
	return argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, 32)
}

func sealExport(plaintext, key, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(crand.Reader, nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, plaintext, aad), nil
}

func openExport(data, key, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(data) < gcm.NonceSize() {
		return nil, errors.New("truncated data")
	}
	return gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], aad)
}

// buildExportBlob encrypts payload with the password and encodes the file.
func buildExportBlob(payload []byte, password string) ([]byte, error) {
	salt := make([]byte, exportSaltLen)
	if _, err := io.ReadFull(crand.Reader, salt); err != nil {
		return nil, err
	}
	header := make([]byte, 0, len(exportMagic)+1+exportSaltLen)
	header = append(header, exportMagic...)
	header = append(header, byte(exportVersion))
	header = append(header, salt...)

	key := deriveExportKey(password, salt)
	ct, err := sealExport(payload, key, header)
	if err != nil {
		return nil, err
	}
	blob := make([]byte, 0, len(header)+len(ct))
	blob = append(blob, header...)
	blob = append(blob, ct...)
	encoded := make([]byte, base64.StdEncoding.EncodedLen(len(blob)))
	base64.StdEncoding.Encode(encoded, blob)
	return encoded, nil
}

// parseExportBlob validates the header and decrypts the file content.
func parseExportBlob(fileData []byte, password string) ([]byte, error) {
	raw := make([]byte, base64.StdEncoding.DecodedLen(len(fileData)))
	n, err := base64.StdEncoding.Decode(raw, []byte(strings.TrimSpace(string(fileData))))
	if err != nil {
		return nil, errors.New("not a ZentraDeck inventory file")
	}
	raw = raw[:n]

	headerLen := len(exportMagic) + 1 + exportSaltLen
	if len(raw) < headerLen {
		return nil, errors.New("not a ZentraDeck inventory file")
	}
	if string(raw[:len(exportMagic)]) != exportMagic {
		return nil, errors.New("not a ZentraDeck inventory file")
	}
	if raw[len(exportMagic)] != exportVersion {
		return nil, fmt.Errorf("unsupported inventory format version %d", raw[len(exportMagic)])
	}
	header := raw[:headerLen]
	salt := raw[len(exportMagic)+1 : headerLen]

	key := deriveExportKey(password, salt)
	plain, err := openExport(raw[headerLen:], key, header)
	if err != nil {
		return nil, errors.New("wrong password or corrupted file")
	}
	return plain, nil
}

// ExportServersEncrypted writes the full server inventory - including
// passwords, private keys and proxy credentials that never leave the local
// vault otherwise - into a password-encrypted .zdsv file. The user picks the
// destination with a native save dialog. Returns the written path, or an
// empty string when the dialog was cancelled.
func (a *App) ExportServersEncrypted(password string) (string, error) {
	if len(password) < exportMinPassLength {
		return "", fmt.Errorf("password must be at least %d characters", exportMinPassLength)
	}

	a.mu.Lock()
	list := make([]ServerConfig, 0, len(a.servers))
	for _, s := range a.servers {
		if !s.IsDemo {
			list = append(list, s)
		}
	}
	a.mu.Unlock()
	if len(list) == 0 {
		return "", errors.New("no servers to export")
	}

	payload := exportPayload{Version: exportVersion, ExportedAt: time.Now().UTC(), Servers: list}
	plain, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	blob, err := buildExportBlob(plain, password)
	if err != nil {
		return "", err
	}

	savePath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           "Export Encrypted Server Inventory",
		DefaultFilename: "zentradeck-inventory" + exportFileExt,
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "ZentraDeck Encrypted Inventory (*" + exportFileExt + ")", Pattern: "*" + exportFileExt},
		},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(savePath) == "" {
		return "", nil // user cancelled the dialog
	}
	if !strings.HasSuffix(strings.ToLower(savePath), exportFileExt) {
		savePath += exportFileExt
	}
	if err := os.WriteFile(savePath, blob, 0600); err != nil {
		return "", err
	}
	return savePath, nil
}

// ImportServersEncrypted reads a password-encrypted .zdsv file chosen with a
// native open dialog and merges it into the local inventory:
//
//   - servers whose ID already exists are updated in place (imported fields
//     win; local secrets are kept whenever the imported entry has none, via
//     the same mergeExistingSecrets used by the edit form),
//   - unknown servers are appended (a missing ID gets a fresh one),
//   - demo entries are skipped on both sides.
//
// The summary is returned even when the user cancels the dialog, with
// Cancelled set, so the UI can avoid showing a toast.
func (a *App) ImportServersEncrypted(password string) (ImportSummary, error) {
	var summary ImportSummary

	openPath, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Import Encrypted Server Inventory",
		Filters: []wailsruntime.FileFilter{
			{DisplayName: "ZentraDeck Encrypted Inventory (*" + exportFileExt + ")", Pattern: "*" + exportFileExt},
		},
	})
	if err != nil {
		return summary, err
	}
	if strings.TrimSpace(openPath) == "" {
		summary.Cancelled = true
		return summary, nil
	}
	if password == "" {
		return summary, fmt.Errorf("password must be at least %d characters", exportMinPassLength)
	}

	fileData, err := os.ReadFile(openPath)
	if err != nil {
		return summary, err
	}
	plain, err := parseExportBlob(fileData, password)
	if err != nil {
		return summary, err
	}
	var payload exportPayload
	if err := json.Unmarshal(plain, &payload); err != nil {
		return summary, errors.New("wrong password or corrupted file")
	}
	if payload.Version > exportVersion {
		return summary, fmt.Errorf("file was created by a newer ZentraDeck version (format v%d)", payload.Version)
	}

	a.mu.Lock()
	defer a.mu.Unlock()
	for _, imported := range payload.Servers {
		if imported.IsDemo || strings.HasPrefix(imported.ID, "demo-") {
			continue
		}
		if strings.TrimSpace(imported.ID) == "" {
			imported.ID = newID()
		}
		merged := false
		for i := range a.servers {
			if a.servers[i].ID == imported.ID {
				imported = mergeExistingSecrets(imported, a.servers[i])
				imported.IsDemo = false
				a.servers[i] = imported
				summary.Updated++
				merged = true
				break
			}
		}
		if !merged {
			imported.IsDemo = false
			a.servers = append(a.servers, imported)
			summary.Added++
		}
	}
	if summary.Added > 0 || summary.Updated > 0 {
		if err := a.saveServersLocked(); err != nil {
			return ImportSummary{}, err
		}
	}
	return summary, nil
}
