package com.lokalkh.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.BatchSize;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "places")
@Getter
@Setter
@NoArgsConstructor
public class Place {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    /** Restaurants | Hotels | Popular Places | Cafes */
    @Column(nullable = false, length = 50)
    private String category;

    /** Phnom Penh | Siem Reap | Kampot */
    @Column(nullable = false, length = 50)
    private String city;

    private double rating;

    @Column(name = "review_count")
    private int reviewCount;

    @Column(length = 10)
    private String price = "$$";

    @Column(name = "is_open")
    private boolean open = true;

    private boolean featured;

    private String hours;

    @Column(name = "distance_km")
    private double distanceKm;

    @Column(nullable = false)
    private String address;

    @Column(length = 50)
    private String phone;

    private double lat;
    private double lng;

    @Column(nullable = false, length = 2000)
    private String description;

    @ElementCollection
    @CollectionTable(name = "place_tags", joinColumns = @JoinColumn(name = "place_id"))
    @Column(name = "tag")
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    private List<String> tags = new ArrayList<>();

    @ElementCollection
    @CollectionTable(name = "place_images", joinColumns = @JoinColumn(name = "place_id"))
    @Column(name = "url", length = 1000)
    @OrderColumn(name = "position")
    @BatchSize(size = 50)
    private List<String> images = new ArrayList<>();

    @OneToMany(mappedBy = "place", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 50)
    private List<Review> reviews = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private AppUser owner;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
}
