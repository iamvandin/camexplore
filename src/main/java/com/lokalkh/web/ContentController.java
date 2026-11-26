package com.lokalkh.web;

import com.lokalkh.dto.Dtos.ContactRequest;
import com.lokalkh.dto.Dtos.ContentResponse;
import com.lokalkh.service.ContentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ContentController {

    private final ContentService contentService;

    @GetMapping("/content")
    public ContentResponse content() {
        return contentService.get();
    }

    @PostMapping("/contact")
    @ResponseStatus(HttpStatus.CREATED)
    public void contact(@Valid @RequestBody ContactRequest req) {
        contentService.saveContactMessage(req);
    }
}
