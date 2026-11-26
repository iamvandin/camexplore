package com.lokalkh.config;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lokalkh.domain.*;
import com.lokalkh.repository.PlaceRepository;
import com.lokalkh.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Inserts demo users and the original 8 sample places when the database is empty.
 * Disable with app.seed.enabled=false.
 */
@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private final UserRepository users;
    private final PlaceRepository places;
    private final PasswordEncoder encoder;
    private final ObjectMapper mapper;

    @Value("${app.seed.enabled:true}")
    private boolean enabled;

    record SeedReview(String author, int daysAgo, int rating, String text) {
    }

    record SeedPlace(String name, String category, String city, double rating, int reviewCount,
                     String price, @JsonProperty("isOpen") boolean isOpen, boolean featured,
                     String hours, double distanceKm, String address, String phone,
                     double lat, double lng, List<String> tags, String description,
                     List<String> images, String ownerEmail, List<SeedReview> reviews) {
    }

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        if (!enabled || users.count() > 0) {
            return;
        }

        Map<String, AppUser> byEmail = new HashMap<>();
        byEmail.put("admin@lokalkh.com", user("Admin Cambodia", "admin@lokalkh.com", "Admin@123", Role.ADMIN, Plan.FEATURED));
        byEmail.put("sokha@lokalkh.com", user("Sokha Meas", "sokha@lokalkh.com", "Explorer@123", Role.EXPLORER, Plan.FREE));
        byEmail.put("owner@malis.com", user("Malis Group", "owner@malis.com", "Business@123", Role.BUSINESS, Plan.FEATURED));
        byEmail.put("hello@daracafe.kh", user("Dara Coffee", "hello@daracafe.kh", "Business@123", Role.BUSINESS, Plan.PRO));
        users.saveAll(byEmail.values());

        List<SeedPlace> seed;
        try (InputStream in = new ClassPathResource("seed/places.json").getInputStream()) {
            seed = mapper.readValue(in, new TypeReference<List<SeedPlace>>() {
            });
        }

        for (SeedPlace s : seed) {
            Place p = new Place();
            p.setName(s.name());
            p.setCategory(s.category());
            p.setCity(s.city());
            p.setRating(s.rating());
            p.setReviewCount(s.reviewCount());
            p.setPrice(s.price());
            p.setOpen(s.isOpen());
            p.setFeatured(s.featured());
            p.setHours(s.hours());
            p.setDistanceKm(s.distanceKm());
            p.setAddress(s.address());
            p.setPhone(s.phone());
            p.setLat(s.lat());
            p.setLng(s.lng());
            p.setDescription(s.description());
            p.setTags(new ArrayList<>(s.tags()));
            p.setImages(new ArrayList<>(s.images()));
            if (s.ownerEmail() != null) {
                p.setOwner(byEmail.get(s.ownerEmail()));
            }
            if (s.reviews() != null) {
                for (SeedReview sr : s.reviews()) {
                    Review r = new Review();
                    r.setPlace(p);
                    r.setAuthor(sr.author());
                    r.setRating(sr.rating());
                    r.setText(sr.text());
                    r.setCreatedAt(Instant.now().minus(sr.daysAgo(), ChronoUnit.DAYS).minus(5, ChronoUnit.MINUTES));
                    p.getReviews().add(r);
                }
            }
            places.save(p);
        }

        log.info("Seeded {} users and {} places. Demo logins: admin@lokalkh.com / Admin@123, sokha@lokalkh.com / Explorer@123",
                byEmail.size(), seed.size());
    }

    private AppUser user(String name, String email, String rawPassword, Role role, Plan plan) {
        AppUser u = new AppUser();
        u.setName(name);
        u.setEmail(email);
        u.setPasswordHash(encoder.encode(rawPassword));
        u.setRole(role);
        u.setPlan(plan);
        u.setStatus(UserStatus.ACTIVE);
        return u;
    }
}
