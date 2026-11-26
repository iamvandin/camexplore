package com.lokalkh.service;

import com.lokalkh.domain.*;
import com.lokalkh.dto.Dtos.*;
import com.lokalkh.exception.ApiException;
import com.lokalkh.repository.PlaceRepository;
import com.lokalkh.repository.UserRepository;
import com.lokalkh.security.AuthenticatedUser;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
public class PlaceService {

    /** City map centres (lat, lng) - used to position new listings on the map. */
    private static final Map<String, double[]> CITY_CENTERS = Map.of(
            "Phnom Penh", new double[]{11.5564, 104.9282},
            "Siem Reap", new double[]{13.3820, 103.8600},
            "Kampot", new double[]{10.6060, 104.1780});

    private static final Set<String> CATEGORIES = Set.of("Restaurants", "Hotels", "Popular Places", "Cafes");
    private static final Set<String> PRICES = Set.of("$", "$$", "$$$", "$$$$");
    private static final int PRO_PLACE_LIMIT = 5;
    private static final List<String> DEFAULT_IMAGES = List.of(
            "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80");

    private final PlaceRepository places;
    private final UserRepository users;

    // ------------------------------------------------------------------ queries

    @Transactional(readOnly = true)
    public List<PlaceResponse> search(String q, String city, String category, boolean openNow,
                                      String sort, Long savedForUserId) {
        final Set<Long> savedIds;
        if (savedForUserId != null) {
            savedIds = new HashSet<>(users.findSavedPlaceIds(savedForUserId));
            if (savedIds.isEmpty()) {
                return List.of();
            }
        } else {
            savedIds = null;
        }

        Specification<Place> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (hasValue(city) && !"all".equalsIgnoreCase(city)) {
                ps.add(cb.equal(root.get("city"), city));
            }
            if (hasValue(category) && !"All".equalsIgnoreCase(category)) {
                ps.add(cb.equal(root.get("category"), category));
            }
            if (openNow) {
                ps.add(cb.isTrue(root.get("open")));
            }
            if (savedIds != null) {
                ps.add(root.get("id").in(savedIds));
            }
            if (hasValue(q)) {
                String like = "%" + q.trim().toLowerCase() + "%";
                Join<Place, String> tag = root.join("tags", JoinType.LEFT);
                query.distinct(true);
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("name")), like),
                        cb.like(cb.lower(root.get("city")), like),
                        cb.like(cb.lower(root.get("category")), like),
                        cb.like(cb.lower(root.get("description")), like),
                        cb.like(cb.lower(tag), like)));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };

        return places.findAll(spec, sortFor(sort)).stream()
                .map(p -> PlaceResponse.from(p, false))
                .toList();
    }

    @Transactional(readOnly = true)
    public PlaceResponse get(Long id) {
        return PlaceResponse.from(find(id), true);
    }

    // ---------------------------------------------------------------- mutations

    @Transactional
    public PlaceResponse create(AuthenticatedUser me, PlaceRequest req) {
        AppUser user = loadUser(me);
        boolean admin = user.getRole() == Role.ADMIN;

        if (!admin) {
            if (user.getPlan() == Plan.FREE) {
                throw ApiException.forbidden(
                        "Your Explorer plan is view-only. Upgrade to Business Pro or Featured Partner to add places.");
            }
            if (user.getPlan() == Plan.PRO && places.countByOwnerId(user.getId()) >= PRO_PLACE_LIMIT) {
                throw ApiException.forbidden(
                        "Business Pro allows up to " + PRO_PLACE_LIMIT + " places. Upgrade to Featured Partner for unlimited listings.");
            }
        }

        String category = requireCategory(req.category());
        String city = requireCity(req.city());
        String price = hasValue(req.price()) ? req.price().trim() : "$$";
        if (!PRICES.contains(price)) {
            throw ApiException.badRequest("Invalid price level.");
        }

        Place p = new Place();
        p.setName(req.name().trim());
        p.setCategory(category);
        p.setCity(city);
        p.setPrice(price);
        p.setHours(hasValue(req.hours()) ? req.hours().trim() : "08:00 AM - 10:00 PM");
        p.setAddress(req.address().trim());
        p.setDescription(req.description().trim());
        p.setPhone(hasValue(req.phone()) ? req.phone().trim() : "Not provided");
        p.setOpen(true);
        p.setFeatured(admin || user.getPlan() == Plan.FEATURED);
        p.setRating(0);
        p.setReviewCount(0);
        p.setDistanceKm(Math.round((ThreadLocalRandom.current().nextDouble() * 3 + 0.4) * 10) / 10.0);
        placeNearCityCentre(p, city);
        p.setTags(new ArrayList<>(List.of("New Listing", category, city)));
        p.setImages(new ArrayList<>(DEFAULT_IMAGES));
        p.setOwner(user);

        return PlaceResponse.from(places.save(p), true);
    }

    @Transactional
    public PlaceResponse update(AuthenticatedUser me, Long id, PlaceUpdateRequest req) {
        AppUser user = loadUser(me);
        Place p = find(id);
        assertCanManage(user, p);

        if (hasValue(req.name())) {
            p.setName(req.name().trim());
        }
        if (hasValue(req.category())) {
            p.setCategory(requireCategory(req.category()));
        }
        if (hasValue(req.city()) && !req.city().equals(p.getCity())) {
            String city = requireCity(req.city());
            p.setCity(city);
            placeNearCityCentre(p, city);   // keep the map pin inside the new city
        }
        if (req.isOpen() != null) {
            p.setOpen(req.isOpen());
        }
        if (req.featured() != null && user.getRole() == Role.ADMIN) {
            p.setFeatured(req.featured());
        }
        if (hasValue(req.address())) {
            p.setAddress(req.address().trim());
        }
        if (hasValue(req.description())) {
            p.setDescription(req.description().trim());
        }
        return PlaceResponse.from(p, true);
    }

    @Transactional
    public void delete(AuthenticatedUser me, Long id) {
        AppUser user = loadUser(me);
        Place p = find(id);
        assertCanManage(user, p);
        users.deleteBookmarksByPlaceId(id);
        places.delete(p);
    }

    @Transactional
    public PlaceResponse toggleFeatured(Long id) {
        Place p = find(id);
        p.setFeatured(!p.isFeatured());
        return PlaceResponse.from(p, false);
    }

    @Transactional
    public PlaceResponse addReview(AuthenticatedUser me, Long placeId, ReviewRequest req) {
        AppUser user = loadUser(me);
        Place p = find(placeId);

        Review review = new Review();
        review.setPlace(p);
        review.setUser(user);
        review.setAuthor(hasValue(req.author()) ? req.author().trim() : user.getName());
        review.setRating(req.rating());
        review.setText(req.text().trim());
        p.getReviews().add(review);

        int newCount = p.getReviewCount() + 1;
        double avg = (p.getRating() * p.getReviewCount() + req.rating()) / newCount;
        p.setReviewCount(newCount);
        p.setRating(Math.round(avg * 10) / 10.0);

        places.saveAndFlush(p);
        return PlaceResponse.from(p, true);
    }

    // ------------------------------------------------------------------ helpers

    private Place find(Long id) {
        return places.findById(id).orElseThrow(() -> ApiException.notFound("Place not found."));
    }

    private AppUser loadUser(AuthenticatedUser me) {
        return users.findById(me.id())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Account not found."));
    }

    private void assertCanManage(AppUser user, Place place) {
        boolean admin = user.getRole() == Role.ADMIN;
        boolean owner = place.getOwner() != null && place.getOwner().getId().equals(user.getId());
        if (!admin && !owner) {
            throw ApiException.forbidden("You can only manage places you own.");
        }
    }

    private static String requireCategory(String category) {
        String c = category == null ? "" : category.trim();
        if (!CATEGORIES.contains(c)) {
            throw ApiException.badRequest("Invalid category.");
        }
        return c;
    }

    private static String requireCity(String city) {
        String c = city == null ? "" : city.trim();
        if (!CITY_CENTERS.containsKey(c)) {
            throw ApiException.badRequest("Invalid city.");
        }
        return c;
    }

    private static void placeNearCityCentre(Place p, String city) {
        double[] centre = CITY_CENTERS.get(city);
        ThreadLocalRandom rnd = ThreadLocalRandom.current();
        p.setLat(centre[0] + (rnd.nextDouble() - 0.5) * 0.015);
        p.setLng(centre[1] + (rnd.nextDouble() - 0.5) * 0.015);
    }

    private static Sort sortFor(String sort) {
        if ("rating".equals(sort)) {
            return Sort.by(Sort.Order.desc("rating"), Sort.Order.desc("reviewCount"), Sort.Order.asc("id"));
        }
        if ("distance".equals(sort)) {
            return Sort.by(Sort.Order.asc("distanceKm"), Sort.Order.asc("id"));
        }
        // "recommended": featured first, then most reviewed
        return Sort.by(Sort.Order.desc("featured"), Sort.Order.desc("reviewCount"), Sort.Order.asc("id"));
    }

    private static boolean hasValue(String s) {
        return s != null && !s.isBlank();
    }
}
