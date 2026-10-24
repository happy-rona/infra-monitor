package io.infra.monitor.dto;

import io.infra.monitor.domain.Resource;

import java.util.List;

public record SearchResponse(List<Resource> items, int total, boolean totalCapped) {
}
