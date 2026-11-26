package com.lokalkh.repository;

import com.lokalkh.domain.AppUser;
import com.lokalkh.domain.Plan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<AppUser, Long> {

    Optional<AppUser> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    long countByPlanIn(Collection<Plan> plans);

    @Query("select p.id from AppUser u join u.savedPlaces p where u.id = :userId")
    List<Long> findSavedPlaceIds(@Param("userId") Long userId);

    @Modifying
    @Query(value = "delete from bookmarks where place_id = :placeId", nativeQuery = true)
    void deleteBookmarksByPlaceId(@Param("placeId") Long placeId);
}
