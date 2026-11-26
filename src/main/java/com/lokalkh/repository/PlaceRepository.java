package com.lokalkh.repository;

import com.lokalkh.domain.Place;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface PlaceRepository extends JpaRepository<Place, Long>, JpaSpecificationExecutor<Place> {

    long countByFeaturedTrue();

    long countByOwnerId(Long ownerId);
}
