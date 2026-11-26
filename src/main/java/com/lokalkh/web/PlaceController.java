package com.lokalkh.web;

import com.lokalkh.dto.Dtos.*;
import com.lokalkh.exception.ApiException;
import com.lokalkh.security.AuthenticatedUser;
import com.lokalkh.service.PlaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/places")
@RequiredArgsConstructor
public class PlaceController {

    private final PlaceService placeService;

    /**
     * Public search. Query params: q, city, category, openNow, sort (recommended|rating|distance),
     * savedOnly (requires a signed-in user).
     */
    @GetMapping
    public List<PlaceResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "false") boolean openNow,
            @RequestParam(defaultValue = "recommended") String sort,
            @RequestParam(defaultValue = "false") boolean savedOnly,
            @AuthenticationPrincipal AuthenticatedUser me) {
        if (savedOnly && me == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Please sign in to see your saved places.");
        }
        return placeService.search(q, city, category, openNow, sort, savedOnly ? me.id() : null);
    }

    @GetMapping("/{id}")
    public PlaceResponse get(@PathVariable Long id) {
        return placeService.get(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PlaceResponse create(@AuthenticationPrincipal AuthenticatedUser me,
                                @Valid @RequestBody PlaceRequest req) {
        return placeService.create(me, req);
    }

    @PutMapping("/{id}")
    public PlaceResponse update(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id,
                                @Valid @RequestBody PlaceUpdateRequest req) {
        return placeService.update(me, id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id) {
        placeService.delete(me, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reviews")
    @ResponseStatus(HttpStatus.CREATED)
    public PlaceResponse addReview(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id,
                                   @Valid @RequestBody ReviewRequest req) {
        return placeService.addReview(me, id, req);
    }
}
