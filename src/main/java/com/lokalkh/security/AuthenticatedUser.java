package com.lokalkh.security;

import com.lokalkh.domain.Role;

/** Lightweight principal stored in the SecurityContext for each authenticated request. */
public record AuthenticatedUser(Long id, String email, Role role) {
}
