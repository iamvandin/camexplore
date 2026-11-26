package com.lokalkh.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Serialized to / from JSON as a lowercase string, matching the frontend. */
public enum UserStatus {
    ACTIVE, SUSPENDED;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static UserStatus fromJson(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return UserStatus.valueOf(value.trim().toUpperCase());
    }
}
