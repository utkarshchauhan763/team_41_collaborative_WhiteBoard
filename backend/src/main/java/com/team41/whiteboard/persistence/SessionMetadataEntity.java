package com.team41.whiteboard.persistence;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import java.time.Instant;

@Entity(name = "session_metadata")
public class SessionMetadataEntity {

    @Id
    private String roomId;

    private Instant createdAt;
    private Instant savedAt;
    private int objectCount;
    private int noteCount;

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getSavedAt() {
        return savedAt;
    }

    public void setSavedAt(Instant savedAt) {
        this.savedAt = savedAt;
    }

    public int getObjectCount() {
        return objectCount;
    }

    public void setObjectCount(int objectCount) {
        this.objectCount = objectCount;
    }

    public int getNoteCount() {
        return noteCount;
    }

    public void setNoteCount(int noteCount) {
        this.noteCount = noteCount;
    }
}
