package com.lokalkh.service;

import com.lokalkh.domain.*;
import com.lokalkh.dto.Dtos.*;
import com.lokalkh.exception.ApiException;
import com.lokalkh.repository.UserRepository;
import com.lokalkh.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional
    public AuthResponse register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ApiException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        Plan plan = req.plan() == null ? Plan.FREE : req.plan();

        AppUser user = new AppUser();
        user.setName(req.name().trim());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.setPlan(plan);
        // Same rule as the original UI: paid plans are "business" accounts. Admin can never be self-registered.
        user.setRole(plan == Plan.FREE ? Role.EXPLORER : Role.BUSINESS);
        user.setStatus(UserStatus.ACTIVE);
        users.save(user);

        return new AuthResponse(jwtService.generate(user.getEmail()), UserResponse.from(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        AppUser user = users.findByEmailIgnoreCase(req.email().trim())
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid email or password."));
        if (user.getStatus() == UserStatus.SUSPENDED) {
            throw ApiException.forbidden("This account has been suspended by an administrator.");
        }
        return new AuthResponse(jwtService.generate(user.getEmail()), UserResponse.from(user));
    }

    @Transactional(readOnly = true)
    public UserResponse me(Long userId) {
        return UserResponse.from(find(userId));
    }

    @Transactional
    public UserResponse changePlan(Long userId, Plan plan) {
        AppUser user = find(userId);
        user.setPlan(plan);
        if (user.getRole() != Role.ADMIN) {
            user.setRole(plan == Plan.FREE ? Role.EXPLORER : Role.BUSINESS);
        }
        return UserResponse.from(user);
    }

    private AppUser find(Long id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Account not found."));
    }
}
