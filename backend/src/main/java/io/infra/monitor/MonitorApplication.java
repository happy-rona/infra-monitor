package io.infra.monitor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.http.CacheControl;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.concurrent.TimeUnit;

@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class MonitorApplication implements WebMvcConfigurer {
    public static void main(String[] args) {
        SpringApplication.run(MonitorApplication.class, args);
    }

    @ConfigurationProperties(prefix = "monitor")
    public record Settings(Seed seed, Simulator simulator) {
        public record Seed(String mode, int clusters, int nodesPerCluster, int namespacesPerNode,
                           int podsPerNamespace, long randomSeed) {
        }

        public record Simulator(boolean enabled, long intervalMs, int changesPerTick) {
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**").allowedOrigins("http://localhost:5173", "http://localhost:4173");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/static/assets/", "file:../frontend/dist/assets/")
                .setCacheControl(CacheControl.maxAge(365, TimeUnit.DAYS).cachePublic().immutable());
    }
}
