package com.lokalkh.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Serialized to / from JSON as a lowercase string, matching the frontend. */
public enum Role {
    EXPLORER, BUSINESS, ADMIN;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static Role fromJson(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Role.valueOf(value.trim().toUpperCase());
    }
}
