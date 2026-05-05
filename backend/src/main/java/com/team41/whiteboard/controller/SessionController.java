package com.team41.whiteboard.controller;

import com.team41.whiteboard.persistence.SessionMetadataEntity;
import com.team41.whiteboard.service.RoomService;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sessions")
public class SessionController {

    private final RoomService roomService;

    public SessionController(RoomService roomService) {
        this.roomService = roomService;
    }

    @GetMapping("/{roomId}")
    public Map<String, Object> session(@PathVariable String roomId) {
        SessionMetadataEntity metadata = roomService.getSessionMetadata(roomId);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", metadata.getRoomId());
        response.put("createdAt", metadata.getCreatedAt() == null ? null : metadata.getCreatedAt().toString());
        response.put("savedAt", metadata.getSavedAt() == null ? null : metadata.getSavedAt().toString());
        response.put("objectCount", metadata.getObjectCount());
        response.put("noteCount", metadata.getNoteCount());
        response.put("participantCount", roomService.participants(roomId).size());
        return response;
    }

    @PostMapping("/{roomId}/save")
    public Map<String, Object> save(@PathVariable String roomId) {
        SessionMetadataEntity metadata = roomService.saveSession(roomId);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("roomId", metadata.getRoomId());
        response.put("savedAt", metadata.getSavedAt() == null ? null : metadata.getSavedAt().toString());
        response.put("objectCount", metadata.getObjectCount());
        response.put("noteCount", metadata.getNoteCount());
        return response;
    }
}
