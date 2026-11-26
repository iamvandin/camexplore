package com.lokalkh.service;

import com.lokalkh.domain.AppUser;
import com.lokalkh.domain.Place;
import com.lokalkh.exception.ApiException;
import com.lokalkh.repository.PlaceRepository;
import com.lokalkh.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BookmarkService {

    private final UserRepository users;
    private final PlaceRepository places;

    @Transactional(readOnly = true)
    public List<Long> list(Long userId) {
        return users.findSavedPlaceIds(userId);
    }

    @Transactional
    public List<Long> add(Long userId, Long placeId) {
        AppUser user = loadUser(userId);
        Place place = places.findById(placeId).orElseThrow(() -> ApiException.notFound("Place not found."));
        user.getSavedPlaces().add(place);
        return ids(user);
    }

    @Transactional
    public List<Long> remove(Long userId, Long placeId) {
        AppUser user = loadUser(userId);
        user.getSavedPlaces().removeIf(p -> p.getId().equals(placeId));
        return ids(user);
    }

    private AppUser loadUser(Long id) {
        return users.findById(id).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Account not found."));
    }

    private static List<Long> ids(AppUser user) {
        return user.getSavedPlaces().stream().map(Place::getId).sorted().toList();
    }
}
