package io.infra.monitor;

import io.infra.monitor.mock.ChangeSimulator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "monitor.seed.mode=reset",
        "monitor.seed.clusters=2",
        "monitor.seed.nodes-per-cluster=3",
        "monitor.seed.namespaces-per-node=4",
        "monitor.seed.pods-per-namespace=5",
        "monitor.simulator.enabled=false"
})
@AutoConfigureMockMvc
@Testcontainers
class ResourceApiTest {
    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    MockMvc mvc;

    @Autowired
    ChangeSimulator simulator;

    @Test
    void lastUpdatedStartsFromSeededData() throws Exception {
        mvc.perform(get("/api/last-updated"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lastUpdatedAt").isNumber());
    }

    @Test
    void clustersAndChildrenFormHierarchy() throws Exception {
        mvc.perform(get("/api/clusters"))
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].kind", is("CLUSTER")))
                .andExpect(jsonPath("$[0].childCount", is(3)))
                .andExpect(jsonPath("$[0].desc.healthy").exists());
        mvc.perform(get("/api/resources/1/children"))
                .andExpect(jsonPath("$", hasSize(3)))
                .andExpect(jsonPath("$[*].kind", everyItem(is("NODE"))))
                .andExpect(jsonPath("$[*].parentId", everyItem(is(1))));
    }

    @Test
    void detailIncludesAttributes() throws Exception {
        long podId = 152;
        mvc.perform(get("/api/resources/" + podId))
                .andExpect(jsonPath("$.resource.kind", is("POD")))
                .andExpect(jsonPath("$.resource.path").exists())
                .andExpect(jsonPath("$.attrs.image").exists());
        mvc.perform(get("/api/resources/999999")).andExpect(status().isNotFound());
    }

    @Test
    void searchReturnsLocationOfMatches() throws Exception {
        mvc.perform(get("/api/search").param("q", "KUBE-SYSTEM"))
                .andExpect(jsonPath("$.total", is(6)))
                .andExpect(jsonPath("$.items[0].name", is("kube-system")))
                .andExpect(jsonPath("$.items[0].path").exists())
                .andExpect(jsonPath("$.items[0].clusterId").exists())
                .andExpect(jsonPath("$.items[0].nodeId").exists());
        mvc.perform(get("/api/search").param("q", "100%_")).andExpect(jsonPath("$.total", is(0)));
        mvc.perform(get("/api/search").param("q", " ")).andExpect(status().isBadRequest());
    }

    @Test
    void listPodsPagesWithFilter() throws Exception {
        mvc.perform(get("/api/pods").param("limit", "50"))
                .andExpect(jsonPath("$.total", is(120)))
                .andExpect(jsonPath("$.items", hasSize(50)))
                .andExpect(jsonPath("$.items[*].kind", everyItem(is("POD"))));
        mvc.perform(get("/api/pods").param("offset", "100").param("limit", "50"))
                .andExpect(jsonPath("$.items", hasSize(20)));
        mvc.perform(get("/api/pods").param("status", "HEALTHY"))
                .andExpect(jsonPath("$.items[*].status", everyItem(is("HEALTHY"))));
        mvc.perform(get("/api/pods").param("limit", "501")).andExpect(status().isBadRequest());
    }

    @Test
    void changesReturnsOnlyResourcesUpdatedAfterSince() throws Exception {
        String body = mvc.perform(get("/api/last-updated")).andReturn().getResponse().getContentAsString();
        long since = Long.parseLong(body.replaceAll(".*\"lastUpdatedAt\":(\\d+).*", "$1"));
        mvc.perform(get("/api/changes").param("since", String.valueOf(since)))
                .andExpect(jsonPath("$.items", hasSize(0)));

        int updated = simulator.tick(10);

        mvc.perform(get("/api/changes").param("since", String.valueOf(since)))
                .andExpect(jsonPath("$.items", hasSize(updated)))
                .andExpect(jsonPath("$.items[*].updatedAt", everyItem(greaterThan(since))))
                .andExpect(jsonPath("$.lastUpdatedAt", greaterThan(since)));
    }
}
