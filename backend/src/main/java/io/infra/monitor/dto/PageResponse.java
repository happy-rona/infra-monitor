package io.infra.monitor.dto;

import io.infra.monitor.domain.Resource;

import java.util.List;

public record PageResponse(int total, int offset, List<Resource> items) {
}
