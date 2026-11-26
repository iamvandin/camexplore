package com.lokalkh.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.lokalkh.domain.*;
import com.lokalkh.util.TimeAgo;
import jakarta.validation.constraints.*;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/** All request / response payloads in one place. JSON field names match what the frontend expects. */
public final class Dtos {

    private Dtos() {
    }

    // ------------------------------------------------------------------ generic
    public record ErrorResponse(String message) {
    }

    // --------------------------------------------------------------------- auth
    public record RegisterRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(min = 6, max = 100) String password,
            Plan plan) {
    }

    public record LoginRequest(
            @NotBlank String email,
            @NotBlank String password) {
    }

    public record UserResponse(Long id, String name, String email, String initials,
                               Role role, Plan plan, UserStatus status) {
        public static UserResponse from(AppUser u) {
            return new UserResponse(u.getId(), u.getName(), u.getEmail(), u.getInitials(),
                    u.getRole(), u.getPlan(), u.getStatus());
        }
    }

    public record AuthResponse(String token, UserResponse user) {
    }

    public record SubscriptionRequest(@NotNull Plan plan) {
    }

    // ------------------------------------------------------------------- places
    public record PlaceRequest(
            @NotBlank @Size(max = 200) String name,
            @NotBlank String category,
            @NotBlank String city,
            String price,
            @Size(max = 200) String hours,
            @NotBlank @Size(max = 255) String address,
            @NotBlank @Size(max = 2000) String description,
            @Size(max = 50) String phone) {
    }

    /** Partial update: null fields are left untouched. */
    public record PlaceUpdateRequest(
            @Size(max = 200) String name,
            String category,
            String city,
            @JsonProperty("isOpen") Boolean isOpen,
            Boolean featured,
            @Size(max = 255) String address,
            @Size(max = 2000) String description) {
    }

    public record ReviewResponse(Long id, String author, String date, int rating, String text) {
        public static ReviewResponse from(Review r) {
            return new ReviewResponse(r.getId(), r.getAuthor(), TimeAgo.format(r.getCreatedAt()),
                    r.getRating(), r.getText());
        }
    }

    public record PlaceResponse(
            Long id, String name, String category, String city,
            double rating, int reviewCount, String price,
            @JsonProperty("isOpen") boolean isOpen,
            boolean featured, String hours, double distanceKm,
            String address, String phone, double lat, double lng,
            List<String> tags, String description, List<String> images,
            List<ReviewResponse> reviews) {

        /** Must be called inside a transaction (touches lazy collections). */
        public static PlaceResponse from(Place p, boolean withReviews) {
            List<ReviewResponse> reviews = withReviews
                    ? p.getReviews().stream()
                    .sorted(Comparator.comparing(Review::getCreatedAt).reversed())
                    .map(ReviewResponse::from)
                    .toList()
                    : List.of();
            return new PlaceResponse(p.getId(), p.getName(), p.getCategory(), p.getCity(),
                    p.getRating(), p.getReviewCount(), p.getPrice(), p.isOpen(),
                    p.isFeatured(), p.getHours(), p.getDistanceKm(),
                    p.getAddress(), p.getPhone(), p.getLat(), p.getLng(),
                    List.copyOf(p.getTags()), p.getDescription(), List.copyOf(p.getImages()),
                    reviews);
        }
    }

    public record ReviewRequest(
            @Size(max = 100) String author,
            @Min(1) @Max(5) int rating,
            @NotBlank @Size(max = 1000) String text) {
    }

    // -------------------------------------------------------------------- admin
    public record StatsResponse(long places, long users, long paid, long featured) {
    }

    public record UpdateRoleRequest(@NotNull Role role) {
    }

    public record UpdatePlanRequest(@NotNull Plan plan) {
    }

    public record UpdateStatusRequest(@NotNull UserStatus status) {
    }

    // ------------------------------------------------------------ content / contact
    public record ContentRequest(
            @NotBlank @Size(max = 200) String heroTitle,
            @NotBlank @Size(max = 500) String heroSubtitle) {
    }

    public record ContentResponse(String heroTitle, String heroSubtitle) {
    }

    public record ContactRequest(
            @NotBlank @Size(max = 100) String name,
            @NotBlank @Email @Size(max = 200) String email,
            @NotBlank @Size(max = 3000) String message) {
    }

    public record ContactMessageResponse(Long id, String name, String email, String message, Instant createdAt) {
        public static ContactMessageResponse from(ContactMessage m) {
            return new ContactMessageResponse(m.getId(), m.getName(), m.getEmail(), m.getMessage(), m.getCreatedAt());
        }
    }
}
