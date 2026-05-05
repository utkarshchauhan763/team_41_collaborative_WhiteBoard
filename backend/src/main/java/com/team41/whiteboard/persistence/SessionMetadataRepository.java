package com.team41.whiteboard.persistence;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SessionMetadataRepository extends JpaRepository<SessionMetadataEntity, String> {
}
