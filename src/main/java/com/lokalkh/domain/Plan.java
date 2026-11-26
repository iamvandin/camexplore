package com.lokalkh.domain;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Serialized to / from JSON as a lowercase string, matching the frontend. */
public enum Plan {
    FREE, PRO, FEATURED;

    @JsonValue
    public String toJson() {
        return name().toLowerCase();
    }

    @JsonCreator
    public static Plan fromJson(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return Plan.valueOf(value.trim().toUpperCase());
    }
}
