package com.team41.whiteboard.model;

public enum Role {
    OWNER,
    EDITOR,
    VIEWER;

    public String toFrontendValue() {
        return name().toLowerCase();
    }

    public static Role fromRequestedValue(String value) {
        if (value == null || value.isBlank()) {
            return EDITOR;
        }

        return switch (value.toLowerCase()) {
            case "owner" -> OWNER;
            case "viewer" -> VIEWER;
            default -> EDITOR;
        };
    }
}
