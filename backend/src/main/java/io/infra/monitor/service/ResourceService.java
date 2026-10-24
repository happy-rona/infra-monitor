package io.infra.monitor.service;

import io.infra.monitor.domain.Resource;
import io.infra.monitor.domain.Resource.Status;
import io.infra.monitor.dto.ChangesResponse;
import io.infra.monitor.dto.DetailResponse;
import io.infra.monitor.dto.PageResponse;
import io.infra.monitor.dto.SearchResponse;
import io.infra.monitor.repository.ResourceRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.NoSuchElementException;

@Service
@Transactional(readOnly = true)
public class ResourceService {
    static final int MAX_CHILDREN = 1_000;
    static final int SEARCH_CAP = 1_000;

    private final ResourceRepository repository;

    public ResourceService(ResourceRepository repository) {
        this.repository = repository;
    }

    public List<Resource> clusters() {
        return repository.findRoots();
    }

    public List<Resource> children(long parentId) {
        return repository.findChildren(parentId, MAX_CHILDREN);
    }

    public DetailResponse detail(long id) {
        Resource resource = repository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Resource not found: " + id));
        return new DetailResponse(resource, repository.findAttrs(id));
    }

    public SearchResponse search(String term, Collection<Status> statuses, int limit) {
        int total = repository.countSearch(term, statuses, SEARCH_CAP);
        return new SearchResponse(repository.search(term, statuses, SEARCH_CAP, limit), total, total >= SEARCH_CAP);
    }

    public PageResponse pods(Collection<Status> statuses, int offset, int limit, boolean withTotal) {
        int total = withTotal ? repository.countPods(statuses) : -1;
        return new PageResponse(total, offset, repository.listPods(statuses, offset, limit));
    }

    public ChangesResponse changes(long since, int limit) {
        List<Resource> items = repository.findChangedSince(since, limit);
        if (items.size() < limit) {
            return new ChangesResponse(lastUpdatedAt(items, since), items, false);
        }
        long last = items.get(items.size() - 1).updatedAt();
        List<Resource> complete = items.stream().filter(r -> r.updatedAt() < last).toList();
        if (complete.isEmpty()) {
            complete = repository.findChangedAt(last);
        }
        return new ChangesResponse(lastUpdatedAt(complete, since), complete, true);
    }

    public long lastUpdatedAt() {
        return repository.maxUpdatedAt();
    }

    private static long lastUpdatedAt(List<Resource> items, long since) {
        return items.isEmpty() ? since : items.get(items.size() - 1).updatedAt();
    }
}
