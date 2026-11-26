package com.lokalkh.util;

import java.time.Duration;
import java.time.Instant;

/** Formats an instant as a short relative string such as "3 days ago". */
public final class TimeAgo {

    private TimeAgo() {
    }

    public static String format(Instant then) {
        return format(then, Instant.now());
    }

    public static String format(Instant then, Instant now) {
        if (then == null) {
            return "";
        }
        Duration d = Duration.between(then, now);
        long minutes = d.toMinutes();
        if (minutes < 1) {
            return "Just now";
        }
        if (minutes < 60) {
            return plural(minutes, "minute");
        }
        long hours = d.toHours();
        if (hours < 24) {
            return plural(hours, "hour");
        }
        long days = d.toDays();
        if (days == 1) {
            return "Yesterday";
        }
        if (days < 7) {
            return plural(days, "day");
        }
        if (days < 30) {
            return plural(days / 7, "week");
        }
        if (days < 365) {
            return plural(days / 30, "month");
        }
        return plural(days / 365, "year");
    }

    private static String plural(long n, String unit) {
        return n + " " + unit + (n == 1 ? "" : "s") + " ago";
    }
}
