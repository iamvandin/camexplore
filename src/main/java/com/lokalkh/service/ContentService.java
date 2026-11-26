package com.lokalkh.service;

import com.lokalkh.domain.ContactMessage;
import com.lokalkh.domain.SiteSetting;
import com.lokalkh.dto.Dtos.ContactRequest;
import com.lokalkh.dto.Dtos.ContentRequest;
import com.lokalkh.dto.Dtos.ContentResponse;
import com.lokalkh.repository.ContactMessageRepository;
import com.lokalkh.repository.SiteSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Editable homepage content + contact-form submissions. */
@Service
@RequiredArgsConstructor
public class ContentService {

    static final String HERO_TITLE_KEY = "hero.title";
    static final String HERO_SUBTITLE_KEY = "hero.subtitle";
    public static final String DEFAULT_TITLE = "Find the best places across Cambodia";
    public static final String DEFAULT_SUBTITLE =
            "Explore top-rated restaurants, boutique hotels, specialty cafes, and iconic cultural landmarks.";

    private final SiteSettingRepository settings;
    private final ContactMessageRepository messages;

    @Transactional(readOnly = true)
    public ContentResponse get() {
        return new ContentResponse(
                settings.findById(HERO_TITLE_KEY).map(SiteSetting::getValue).orElse(DEFAULT_TITLE),
                settings.findById(HERO_SUBTITLE_KEY).map(SiteSetting::getValue).orElse(DEFAULT_SUBTITLE));
    }

    @Transactional
    public ContentResponse update(ContentRequest req) {
        settings.save(new SiteSetting(HERO_TITLE_KEY, req.heroTitle().trim()));
        settings.save(new SiteSetting(HERO_SUBTITLE_KEY, req.heroSubtitle().trim()));
        return get();
    }

    @Transactional
    public void saveContactMessage(ContactRequest req) {
        ContactMessage m = new ContactMessage();
        m.setName(req.name().trim());
        m.setEmail(req.email().trim());
        m.setMessage(req.message().trim());
        messages.save(m);
    }
}
