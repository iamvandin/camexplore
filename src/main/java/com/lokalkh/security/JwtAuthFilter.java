package com.lokalkh.security;

import com.lokalkh.domain.UserStatus;
import com.lokalkh.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Reads "Authorization: Bearer <jwt>", loads the user from the database on every request
 * (so role / plan / suspension changes apply immediately) and populates the SecurityContext.
 * Intentionally NOT a Spring bean, so it is only registered inside the security filter chain.
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository users;

    public JwtAuthFilter(JwtService jwtService, UserRepository users) {
        this.jwtService = jwtService;
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            jwtService.validateAndGetSubject(header.substring(7))
                    .flatMap(users::findByEmailIgnoreCase)
                    .filter(u -> u.getStatus() == UserStatus.ACTIVE)
                    .ifPresent(u -> {
                        AuthenticatedUser principal = new AuthenticatedUser(u.getId(), u.getEmail(), u.getRole());
                        var auth = new UsernamePasswordAuthenticationToken(
                                principal, null,
                                List.of(new SimpleGrantedAuthority("ROLE_" + u.getRole().name())));
                        SecurityContextHolder.getContext().setAuthentication(auth);
                    });
        }
        chain.doFilter(request, response);
    }
}
