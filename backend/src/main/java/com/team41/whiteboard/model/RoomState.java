package com.team41.whiteboard.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class RoomState {
    private final String id;
    private final List<JsonNode> objects = new ArrayList<>();
    private final List<JsonNode> notes = new ArrayList<>();
    private final List<JsonNode> comments = new ArrayList<>();
    private final Map<String, JsonNode> cursors = new ConcurrentHashMap<>();
    private final Map<String, ClientConnection> clients = new ConcurrentHashMap<>();
    private final Instant createdAt = Instant.now();
    private Instant savedAt;

    public RoomState(String id) {
        this.id = id;
    }

    public String getId() {
        return id;
    }

    public List<JsonNode> getObjects() {
        return objects;
    }

    public List<JsonNode> getNotes() {
        return notes;
    }

    public List<JsonNode> getComments() {
        return comments;
    }

    public Map<String, JsonNode> getCursors() {
        return cursors;
    }

    public Map<String, ClientConnection> getClients() {
        return clients;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getSavedAt() {
        return savedAt;
    }

    public void setSavedAt(Instant savedAt) {
        this.savedAt = savedAt;
    }
}
