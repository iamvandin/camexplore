package com.lokalkh.web;

import com.lokalkh.dto.Dtos.*;
import com.lokalkh.security.AuthenticatedUser;
import com.lokalkh.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(@Valid @RequestBody RegisterRequest req) {
        return authService.register(req);
    }

    @PostMapping("/auth/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return authService.login(req);
    }

    @GetMapping("/auth/me")
    public UserResponse me(@AuthenticationPrincipal AuthenticatedUser me) {
        return authService.me(me.id());
    }

    /** Pricing page: the signed-in user switches subscription plan. */
    @PutMapping("/subscription")
    public UserResponse changePlan(@AuthenticationPrincipal AuthenticatedUser me,
                                   @Valid @RequestBody SubscriptionRequest req) {
        return authService.changePlan(me.id(), req.plan());
    }
}
