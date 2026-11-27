package main

import (
	"bytes"
	"encoding/json"
	"testing"
	"time"
)

func TestExportBlobRoundTrip(t *testing.T) {
	servers := []ServerConfig{
		{ID: "srv-a", Name: "Alpha", Host: "10.0.0.1", Port: 22, Username: "root", AuthType: "password", Password: "s3cret", Group: "Prod"},
		{ID: "srv-b", Name: "Beta", Host: "10.0.0.2", Port: 2222, Username: "ubuntu", AuthType: "key", PrivateKey: "KEYDATA", Group: "Dev"},
	}
	payload, err := newTestExportPayload(servers)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	blob, err := buildExportBlob(payload, "correct horse battery")
	if err != nil {
		t.Fatalf("buildExportBlob: %v", err)
	}
	if len(blob) == 0 {
		t.Fatal("blob is empty")
	}

	plain, err := parseExportBlob(blob, "correct horse battery")
	if err != nil {
		t.Fatalf("parseExportBlob with right password: %v", err)
	}
	var got exportPayload
	if err := json.Unmarshal(plain, &got); err != nil {
		t.Fatalf("unmarshal decrypted payload: %v", err)
	}
	if len(got.Servers) != 2 {
		t.Fatalf("expected 2 servers, got %d", len(got.Servers))
	}
	if got.Servers[0].Password != "s3cret" || got.Servers[1].PrivateKey != "KEYDATA" {
		t.Fatal("secrets were not preserved through the round trip")
	}
	if got.Servers[1].Port != 2222 {
		t.Fatalf("expected port 2222, got %d", got.Servers[1].Port)
	}
}

func TestExportBlobWrongPassword(t *testing.T) {
	payload, err := newTestExportPayload([]ServerConfig{{ID: "srv-a", Name: "Alpha"}})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	blob, err := buildExportBlob(payload, "correct horse battery")
	if err != nil {
		t.Fatalf("buildExportBlob: %v", err)
	}
	if _, err := parseExportBlob(blob, "wrong password 123"); err == nil {
		t.Fatal("expected an error with the wrong password")
	}
}

func TestExportBlobRejectsGarbage(t *testing.T) {
	for name, data := range map[string][]byte{
		"empty":          {},
		"not base64":     []byte("!!!not-base64!!!"),
		"wrong magic":    []byte("WGZJVUxUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
		"too short":      []byte("WkRWQVVMVDE="),
		"unknown format": []byte("WkRWQVVMVDkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), // magic + version 9
	} {
		if _, err := parseExportBlob(data, "whatever pass"); err == nil {
			t.Fatalf("%s: expected an error", name)
		}
	}
}

func TestExportBlobTamperDetection(t *testing.T) {
	payload, err := newTestExportPayload([]ServerConfig{{ID: "srv-a", Name: "Alpha"}})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	blob, err := buildExportBlob(payload, "correct horse battery")
	if err != nil {
		t.Fatalf("buildExportBlob: %v", err)
	}

	// Flip one bit inside the base64 payload: the GCM tag must catch it.
	tampered := bytes.Clone(blob)
	tampered[len(tampered)/2] ^= 0x01
	if _, err := parseExportBlob(tampered, "correct horse battery"); err == nil {
		t.Fatal("expected tampered blob to fail authentication")
	}
}

func TestExportBlobFreshSalt(t *testing.T) {
	payload, err := newTestExportPayload([]ServerConfig{{ID: "srv-a"}})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	a, err := buildExportBlob(payload, "same password here")
	if err != nil {
		t.Fatalf("buildExportBlob #1: %v", err)
	}
	b, err := buildExportBlob(payload, "same password here")
	if err != nil {
		t.Fatalf("buildExportBlob #2: %v", err)
	}
	if bytes.Equal(a, b) {
		t.Fatal("two exports of the same payload must differ (fresh salt/nonce per file)")
	}
}

// newTestExportPayload builds a canonical export document for tests.
func newTestExportPayload(servers []ServerConfig) ([]byte, error) {
	return json.Marshal(exportPayload{Version: exportVersion, ExportedAt: time.Now().UTC(), Servers: servers})
}
