package com.team41.whiteboard.model;

import org.springframework.web.socket.WebSocketSession;

public class ClientConnection {
    private final String id;
    private final String name;
    private final String color;
    private Role role;
    private final WebSocketSession session;

    public ClientConnection(String id, String name, String color, Role role, WebSocketSession session) {
        this.id = id;
        this.name = name;
        this.color = color;
        this.role = role;
        this.session = session;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getColor() {
        return color;
    }

    public Role getRole() {
        return role;
    }

    public void setRole(Role role) {
        this.role = role;
    }

    public WebSocketSession getSession() {
        return session;
    }
}
