package io.infra.monitor.dto;

import io.infra.monitor.domain.Resource;

import java.util.List;

public record ChangesResponse(long lastUpdatedAt, List<Resource> items, boolean hasMore) {
}
