package com.team41.whiteboard.websocket;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.team41.whiteboard.model.ClientConnection;
import com.team41.whiteboard.service.RoomService;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

@Component
public class WhiteboardWebSocketHandler extends TextWebSocketHandler {

    private final RoomService roomService;
    private final ObjectMapper objectMapper;

    public WhiteboardWebSocketHandler(RoomService roomService, ObjectMapper objectMapper) {
        this.roomService = roomService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        URI uri = session.getUri();
        Map<String, String> params = UriComponentsBuilder.fromUri(uri).build().getQueryParams().toSingleValueMap();

        String roomId = params.getOrDefault("room", "demo-room");
        String clientId = params.getOrDefault("clientId", "client-" + System.nanoTime());
        String name = decode(params.getOrDefault("name", "Guest"));
        String color = decode(params.getOrDefault("color", "#2563eb"));
        String role = decode(params.getOrDefault("role", "editor"));

        session.getAttributes().put("roomId", roomId);
        session.getAttributes().put("clientId", clientId);

        roomService.registerClient(roomId, clientId, name, color, role, session);
        roomService.send(session, roomService.snapshotPayload(roomId));
        roomService.broadcast(roomId, roomService.participantsPayload(roomId), null);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String roomId = (String) session.getAttributes().get("roomId");
        String clientId = (String) session.getAttributes().get("clientId");
        JsonNode payload = objectMapper.readTree(message.getPayload());
        String type = payload.path("type").asText();

        switch (type) {
            case "cursor:move" -> handleCursorMove(roomId, clientId, payload);
            case "comment:add" -> handleCommentAdd(roomId, clientId, payload);
            case "role:update" -> handleRoleUpdate(roomId, clientId, payload);
            case "board:clear" -> handleBoardClear(roomId, clientId);
            case "object:add" -> handleObjectAdd(roomId, clientId, payload);
            case "object:remove" -> handleObjectRemove(roomId, clientId, payload);
            case "note:add" -> handleNoteAdd(roomId, clientId, payload);
            case "note:update" -> handleNoteUpdate(roomId, clientId, payload);
            case "note:remove" -> handleNoteRemove(roomId, clientId, payload);
            default -> {
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String roomId = (String) session.getAttributes().get("roomId");
        String clientId = (String) session.getAttributes().get("clientId");

        if (roomService.roomExists(roomId)) {
            roomService.broadcast(roomId, Map.of("type", "cursor:remove", "clientId", clientId), null);
        }
        roomService.removeClient(roomId, clientId);
        if (roomService.roomExists(roomId)) {
            roomService.broadcast(roomId, roomService.participantsPayload(roomId), null);
        }
    }

    private void handleCursorMove(String roomId, String clientId, JsonNode payload) throws IOException {
        JsonNode cursor = payload.path("cursor");
        ClientConnection client = roomService.getClient(roomId, clientId);
        if (client == null || cursor.isMissingNode()) {
            return;
        }

        ObjectNode cursorNode = roomService.objectNode();
        cursorNode.put("x", cursor.path("x").asDouble());
        cursorNode.put("y", cursor.path("y").asDouble());
        cursorNode.put("clientId", clientId);
        cursorNode.put("name", client.getName());
        cursorNode.put("color", client.getColor());

        roomService.updateCursor(roomId, clientId, cursorNode);
        roomService.broadcast(
            roomId,
            Map.of("type", "cursor:move", "cursor", cursorNode),
            clientId
        );
    }

    private void handleCommentAdd(String roomId, String clientId, JsonNode payload) throws IOException {
        JsonNode comment = payload.path("comment");
        if (comment.isMissingNode()) {
            return;
        }
        roomService.addComment(roomId, comment);
        roomService.broadcast(roomId, Map.of("type", "comment:add", "comment", comment), clientId);
    }

    private void handleRoleUpdate(String roomId, String clientId, JsonNode payload) throws IOException {
        if (!roomService.isOwner(roomId, clientId)) {
            return;
        }

        String targetId = payload.path("targetId").asText();
        String role = payload.path("role").asText();
        boolean updated = roomService.updateRole(roomId, targetId, role);
        if (!updated) {
            return;
        }

        ClientConnection target = roomService.getClient(roomId, targetId);
        if (target != null && target.getSession().isOpen()) {
            roomService.send(target.getSession(), Map.of("type", "role:assigned", "role", target.getRole().toFrontendValue()));
        }
        roomService.broadcast(roomId, roomService.participantsPayload(roomId), null);
    }

    private void handleBoardClear(String roomId, String clientId) throws IOException {
        if (!roomService.isOwner(roomId, clientId)) {
            return;
        }
        roomService.clearBoard(roomId);
        roomService.broadcast(roomId, Map.of("type", "board:clear"), null);
    }

    private void handleObjectAdd(String roomId, String clientId, JsonNode payload) throws IOException {
        if (!roomService.canEdit(roomId, clientId)) {
            return;
        }
        JsonNode object = payload.path("object");
        if (object.isMissingNode()) {
            return;
        }
        roomService.addObject(roomId, object);
        roomService.broadcast(roomId, Map.of("type", "object:add", "object", object), clientId);
    }

    private void handleObjectRemove(String roomId, String clientId, JsonNode payload) throws IOException {
        if (!roomService.canEdit(roomId, clientId)) {
            return;
        }
        String objectId = payload.path("objectId").asText();
        if (objectId == null || objectId.isBlank()) {
            return;
        }
        roomService.removeObject(roomId, objectId);
        roomService.broadcast(roomId, Map.of("type", "object:remove", "objectId", objectId), clientId);
    }

    private void handleNoteAdd(String roomId, String clientId, JsonNode payload) throws IOException {
        if (!roomService.canEdit(roomId, clientId)) {
            return;
        }
        JsonNode note = payload.path("note");
        if (note.isMissingNode()) {
            return;
        }
        roomService.addNote(roomId, note);
        roomService.broadcast(roomId, Map.of("type", "note:add", "note", note), clientId);
    }

    private void handleNoteUpdate(String roomId, String clientId, JsonNode payload) throws IOException {
        if (!roomService.canEdit(roomId, clientId)) {
            return;
        }
        JsonNode note = payload.path("note");
        if (note.isMissingNode()) {
            return;
        }
        roomService.updateNote(roomId, note);
        roomService.broadcast(roomId, Map.of("type", "note:update", "note", note), clientId);
    }

    private void handleNoteRemove(String roomId, String clientId, JsonNode payload) throws IOException {
        if (!roomService.canEdit(roomId, clientId)) {
            return;
        }
        String noteId = payload.path("noteId").asText();
        if (noteId == null || noteId.isBlank()) {
            return;
        }
        roomService.removeNote(roomId, noteId);
        roomService.broadcast(roomId, Map.of("type", "note:remove", "noteId", noteId), clientId);
    }

    private String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
