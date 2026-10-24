package io.infra.monitor.dto;

import com.fasterxml.jackson.annotation.JsonRawValue;
import io.infra.monitor.domain.Resource;

public record DetailResponse(Resource resource, @JsonRawValue String attrs) {
}
