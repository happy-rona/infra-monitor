package io.infra.monitor.controller;

import io.infra.monitor.domain.Resource;
import io.infra.monitor.domain.Resource.Status;
import io.infra.monitor.dto.ChangesResponse;
import io.infra.monitor.dto.DetailResponse;
import io.infra.monitor.dto.LastUpdatedResponse;
import io.infra.monitor.dto.PageResponse;
import io.infra.monitor.dto.SearchResponse;
import io.infra.monitor.service.ResourceService;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.List;
import java.util.NoSuchElementException;

@Validated
@RestController
@RequestMapping("/api")
public class ResourceController {
    private final ResourceService service;

    public ResourceController(ResourceService service) {
        this.service = service;
    }

    @GetMapping("/last-updated")
    public LastUpdatedResponse lastUpdated() {
        return new LastUpdatedResponse(service.lastUpdatedAt());
    }

    @GetMapping("/clusters")
    public List<Resource> clusters() {
        return service.clusters();
    }

    @GetMapping("/resources/{id}/children")
    public List<Resource> children(@PathVariable long id) {
        return service.children(id);
    }

    @GetMapping("/resources/{id}")
    public DetailResponse detail(@PathVariable long id) {
        return service.detail(id);
    }

    @GetMapping("/pods")
    public PageResponse pods(
            @RequestParam(name = "status", required = false, defaultValue = "") List<Status> statuses,
            @RequestParam(defaultValue = "0") @Min(0) int offset,
            @RequestParam(defaultValue = "100") @Min(1) @Max(500) int limit,
            @RequestParam(defaultValue = "true") boolean withTotal) {
        return service.pods(statuses, offset, limit, withTotal);
    }

    @GetMapping("/search")
    public SearchResponse search(
            @RequestParam @NotBlank @Size(max = 128) String q,
            @RequestParam(name = "status", required = false, defaultValue = "") List<Status> statuses,
            @RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit) {
        return service.search(q.trim(), statuses, limit);
    }

    @GetMapping("/changes")
    public ChangesResponse changes(
            @RequestParam @Min(0) long since,
            @RequestParam(defaultValue = "5000") @Min(1) @Max(20000) int limit) {
        return service.changes(since, limit);
    }

    @ExceptionHandler(NoSuchElementException.class)
    public ProblemDetail notFound(NoSuchElementException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler({ConstraintViolationException.class, HandlerMethodValidationException.class,
            MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class})
    public ProblemDetail badRequest(Exception e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, e.getMessage());
    }
}
