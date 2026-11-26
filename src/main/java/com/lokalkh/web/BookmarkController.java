package com.lokalkh.web;

import com.lokalkh.security.AuthenticatedUser;
import com.lokalkh.service.BookmarkService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Every endpoint returns the user's full, updated list of saved place ids. */
@RestController
@RequestMapping("/api/bookmarks")
@RequiredArgsConstructor
public class BookmarkController {

    private final BookmarkService bookmarks;

    @GetMapping
    public List<Long> list(@AuthenticationPrincipal AuthenticatedUser me) {
        return bookmarks.list(me.id());
    }

    @PutMapping("/{placeId}")
    public List<Long> add(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long placeId) {
        return bookmarks.add(me.id(), placeId);
    }

    @DeleteMapping("/{placeId}")
    public List<Long> remove(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long placeId) {
        return bookmarks.remove(me.id(), placeId);
    }
}
