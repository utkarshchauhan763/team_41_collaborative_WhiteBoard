package com.team41.whiteboard.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.team41.whiteboard.model.ClientConnection;
import com.team41.whiteboard.model.ParticipantInfo;
import com.team41.whiteboard.model.Role;
import com.team41.whiteboard.model.RoomState;
import com.team41.whiteboard.persistence.SessionMetadataEntity;
import com.team41.whiteboard.persistence.SessionMetadataRepository;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

@Service
public class RoomService {

    private final Map<String, RoomState> rooms = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper;
    private final SessionMetadataRepository sessionMetadataRepository;

    public RoomService(
        ObjectMapper objectMapper,
        SessionMetadataRepository sessionMetadataRepository
    ) {
        this.objectMapper = objectMapper;
        this.sessionMetadataRepository = sessionMetadataRepository;
    }

    public RoomState getOrCreateRoom(String roomId) {
        return rooms.computeIfAbsent(roomId, RoomState::new);
    }

    public synchronized ClientConnection registerClient(
        String roomId,
        String clientId,
        String name,
        String color,
        String requestedRole,
        WebSocketSession session
    ) {
        RoomState room = getOrCreateRoom(roomId);
        Role assignedRole;

        if (room.getClients().isEmpty()) {
            assignedRole = Role.OWNER;
        } else {
            Role parsedRole = Role.fromRequestedValue(requestedRole);
            assignedRole = parsedRole == Role.OWNER ? Role.EDITOR : parsedRole;
        }

        ClientConnection connection = new ClientConnection(clientId, name, color, assignedRole, session);
        room.getClients().put(clientId, connection);
        return connection;
    }

    public synchronized void removeClient(String roomId, String clientId) {
        RoomState room = rooms.get(roomId);
        if (room == null) {
            return;
        }

        room.getClients().remove(clientId);
        room.getCursors().remove(clientId);

        if (
            room.getClients().isEmpty()
                && room.getObjects().isEmpty()
                && room.getNotes().isEmpty()
                && room.getComments().isEmpty()
        ) {
            rooms.remove(roomId);
        }
    }

    public synchronized boolean roomExists(String roomId) {
        return rooms.containsKey(roomId);
    }

    public synchronized boolean canEdit(String roomId, String clientId) {
        ClientConnection client = getClient(roomId, clientId);
        return client != null && client.getRole() != Role.VIEWER;
    }

    public synchronized boolean isOwner(String roomId, String clientId) {
        ClientConnection client = getClient(roomId, clientId);
        return client != null && client.getRole() == Role.OWNER;
    }

    public synchronized void addObject(String roomId, JsonNode object) {
        getOrCreateRoom(roomId).getObjects().add(object.deepCopy());
    }

    public synchronized void removeObject(String roomId, String objectId) {
        getOrCreateRoom(roomId).getObjects().removeIf(object -> objectId.equals(object.path("id").asText()));
    }

    public synchronized void addNote(String roomId, JsonNode note) {
        getOrCreateRoom(roomId).getNotes().add(note.deepCopy());
    }

    public synchronized void updateNote(String roomId, JsonNode note) {
        RoomState room = getOrCreateRoom(roomId);
        String noteId = note.path("id").asText();
        for (int i = 0; i < room.getNotes().size(); i++) {
            if (noteId.equals(room.getNotes().get(i).path("id").asText())) {
                room.getNotes().set(i, note.deepCopy());
                return;
            }
        }
    }

    public synchronized void removeNote(String roomId, String noteId) {
        getOrCreateRoom(roomId).getNotes().removeIf(note -> noteId.equals(note.path("id").asText()));
    }

    public synchronized void addComment(String roomId, JsonNode comment) {
        getOrCreateRoom(roomId).getComments().add(comment.deepCopy());
    }

    public synchronized void clearBoard(String roomId) {
        RoomState room = getOrCreateRoom(roomId);
        room.getObjects().clear();
        room.getNotes().clear();
        room.getComments().clear();
        room.getCursors().clear();
    }

    public synchronized void updateCursor(String roomId, String clientId, JsonNode cursor) {
        RoomState room = getOrCreateRoom(roomId);
        room.getCursors().put(clientId, cursor.deepCopy());
    }

    public synchronized boolean updateRole(String roomId, String targetId, String requestedRole) {
        RoomState room = getOrCreateRoom(roomId);
        ClientConnection target = room.getClients().get(targetId);
        if (target == null) {
            return false;
        }

        Role nextRole = Role.fromRequestedValue(requestedRole);
        if (nextRole == Role.OWNER) {
            return false;
        }

        target.setRole(nextRole);
        return true;
    }

    public synchronized SessionMetadataEntity getSessionMetadata(String roomId) {
        RoomState room = getOrCreateRoom(roomId);
        Optional<SessionMetadataEntity> stored = sessionMetadataRepository.findById(roomId);
        if (stored.isPresent()) {
            SessionMetadataEntity metadata = stored.get();
            if (metadata.getCreatedAt() == null) {
                metadata.setCreatedAt(room.getCreatedAt());
            }
            return metadata;
        }

        SessionMetadataEntity metadata = new SessionMetadataEntity();
        metadata.setRoomId(roomId);
        metadata.setCreatedAt(room.getCreatedAt());
        metadata.setSavedAt(room.getSavedAt());
        metadata.setObjectCount(room.getObjects().size());
        metadata.setNoteCount(room.getNotes().size());
        return metadata;
    }

    public synchronized SessionMetadataEntity saveSession(String roomId) {
        RoomState room = getOrCreateRoom(roomId);
        Instant savedAt = Instant.now();
        room.setSavedAt(savedAt);

        SessionMetadataEntity metadata = sessionMetadataRepository.findById(roomId)
            .orElseGet(SessionMetadataEntity::new);
        metadata.setRoomId(roomId);
        metadata.setCreatedAt(room.getCreatedAt());
        metadata.setSavedAt(savedAt);
        metadata.setObjectCount(room.getObjects().size());
        metadata.setNoteCount(room.getNotes().size());

        return sessionMetadataRepository.save(metadata);
    }

    public synchronized Map<String, Object> snapshotPayload(String roomId) {
        RoomState room = getOrCreateRoom(roomId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "room:snapshot");
        payload.put("roomId", roomId);
        payload.put("objects", new ArrayList<>(room.getObjects()));
        payload.put("notes", new ArrayList<>(room.getNotes()));
        payload.put("comments", new ArrayList<>(room.getComments()));
        payload.put("participants", participants(roomId));
        payload.put("savedAt", room.getSavedAt() == null ? null : room.getSavedAt().toString());
        return payload;
    }

    public synchronized Map<String, Object> participantsPayload(String roomId) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "participants:update");
        payload.put("participants", participants(roomId));
        return payload;
    }

    public synchronized List<ParticipantInfo> participants(String roomId) {
        RoomState room = getOrCreateRoom(roomId);
        return room.getClients().values().stream()
            .map(client -> new ParticipantInfo(
                client.getId(),
                client.getName(),
                client.getColor(),
                client.getRole().toFrontendValue()
            ))
            .toList();
    }

    public synchronized ClientConnection getClient(String roomId, String clientId) {
        return getOrCreateRoom(roomId).getClients().get(clientId);
    }

    public synchronized void broadcast(String roomId, Map<String, Object> payload, String excludeClientId)
        throws IOException {
        RoomState room = getOrCreateRoom(roomId);
        String text = objectMapper.writeValueAsString(payload);
        TextMessage message = new TextMessage(text);

        for (ClientConnection client : room.getClients().values()) {
            if (excludeClientId != null && excludeClientId.equals(client.getId())) {
                continue;
            }
            if (client.getSession().isOpen()) {
                client.getSession().sendMessage(message);
            }
        }
    }

    public synchronized void send(WebSocketSession session, Map<String, Object> payload) throws IOException {
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(payload)));
    }

    public ObjectNode objectNode() {
        return objectMapper.createObjectNode();
    }
}
