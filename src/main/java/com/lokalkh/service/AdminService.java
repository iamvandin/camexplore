package com.lokalkh.service;

import com.lokalkh.domain.*;
import com.lokalkh.dto.Dtos.*;
import com.lokalkh.exception.ApiException;
import com.lokalkh.repository.ContactMessageRepository;
import com.lokalkh.repository.PlaceRepository;
import com.lokalkh.repository.UserRepository;
import com.lokalkh.security.AuthenticatedUser;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository users;
    private final PlaceRepository places;
    private final ContactMessageRepository messages;

    @Transactional(readOnly = true)
    public StatsResponse stats() {
        return new StatsResponse(
                places.count(),
                users.count(),
                users.countByPlanIn(List.of(Plan.PRO, Plan.FEATURED)),
                places.countByFeaturedTrue());
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listUsers() {
        return users.findAll(Sort.by("id")).stream().map(UserResponse::from).toList();
    }

    @Transactional
    public UserResponse updateRole(AuthenticatedUser me, Long userId, Role role) {
        AppUser user = find(userId);
        if (user.getId().equals(me.id()) && role != Role.ADMIN) {
            throw ApiException.badRequest("You cannot remove your own administrator role.");
        }
        user.setRole(role);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse updatePlan(Long userId, Plan plan) {
        AppUser user = find(userId);
        user.setPlan(plan);
        return UserResponse.from(user);
    }

    @Transactional
    public UserResponse updateStatus(AuthenticatedUser me, Long userId, UserStatus status) {
        AppUser user = find(userId);
        if (user.getId().equals(me.id()) && status == UserStatus.SUSPENDED) {
            throw ApiException.badRequest("You cannot suspend your own account.");
        }
        user.setStatus(status);
        return UserResponse.from(user);
    }

    @Transactional(readOnly = true)
    public List<ContactMessageResponse> listMessages() {
        return messages.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(ContactMessageResponse::from).toList();
    }

    private AppUser find(Long id) {
        return users.findById(id).orElseThrow(() -> ApiException.notFound("User not found."));
    }
}
