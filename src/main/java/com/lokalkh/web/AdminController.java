package com.lokalkh.web;

import com.lokalkh.dto.Dtos.*;
import com.lokalkh.security.AuthenticatedUser;
import com.lokalkh.service.AdminService;
import com.lokalkh.service.ContentService;
import com.lokalkh.service.PlaceService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Everything under /api/admin requires the ADMIN role (see SecurityConfig). */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService admin;
    private final PlaceService placeService;
    private final ContentService contentService;

    @GetMapping("/stats")
    public StatsResponse stats() {
        return admin.stats();
    }

    @GetMapping("/users")
    public List<UserResponse> users() {
        return admin.listUsers();
    }

    @PatchMapping("/users/{id}/role")
    public UserResponse role(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id,
                             @Valid @RequestBody UpdateRoleRequest req) {
        return admin.updateRole(me, id, req.role());
    }

    @PatchMapping("/users/{id}/plan")
    public UserResponse plan(@PathVariable Long id, @Valid @RequestBody UpdatePlanRequest req) {
        return admin.updatePlan(id, req.plan());
    }

    @PatchMapping("/users/{id}/status")
    public UserResponse status(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable Long id,
                               @Valid @RequestBody UpdateStatusRequest req) {
        return admin.updateStatus(me, id, req.status());
    }

    @PatchMapping("/places/{id}/featured")
    public PlaceResponse toggleFeatured(@PathVariable Long id) {
        return placeService.toggleFeatured(id);
    }

    @PutMapping("/content")
    public ContentResponse updateContent(@Valid @RequestBody ContentRequest req) {
        return contentService.update(req);
    }

    @GetMapping("/messages")
    public List<ContactMessageResponse> messages() {
        return admin.listMessages();
    }
}
