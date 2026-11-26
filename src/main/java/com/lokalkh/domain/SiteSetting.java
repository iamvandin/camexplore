package com.lokalkh.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Simple key/value store for editable website content (hero title, subtitle...). */
@Entity
@Table(name = "site_settings")
@Getter
@Setter
@NoArgsConstructor
public class SiteSetting {

    @Id
    @Column(name = "setting_key", length = 100)
    private String key;

    @Column(name = "setting_value", length = 1000)
    private String value;

    public SiteSetting(String key, String value) {
        this.key = key;
        this.value = value;
    }
}
