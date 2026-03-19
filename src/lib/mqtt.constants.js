/**
 * MQTT Shared Constants - used by both frontend and API routes
 * Can be imported in .js files
 */

export const MQTT_CHANNEL_NAMES = ["RawCH1", "RawCH2", "RawCH3", "RawCH4", "RawCH5", "RawCH6"];

export const MQTT_CHANNEL_COUNT = 6;

/**
 * Generate MQTT topic from device serial ID
 * Pattern: PREFIX/SUFFIX/OUTPUT where PREFIX = first 3 chars, SUFFIX = chars 3-5
 * @example buildMqttTopic("AX606") => "AXC/06/OUTPUT"
 */
export function buildMqttTopic(serialId) {
    const prefix = serialId.slice(0, 3);
    const suffix = serialId.slice(3, 5);
    return `${prefix}/${suffix}/OUTPUT`;
}

/**
 * Extract serial ID from MQTT topic
 * @example extractSerialFromTopic("AXC/06/OUTPUT") => "AXC06"
 */
export function extractSerialFromTopic(topic) {
    const parts = topic.split("/");
    return parts[0] + parts[1];
}

/**
 * MQTT Client connection options
 */
export const MQTT_CLIENT_OPTIONS = {
    connectTimeout: 5000,
    reconnectPeriod: 5000,
    keepalive: 60,
};

/**
 * Cache and polling configuration for MQTT readings
 */
export const MQTT_POLLING_CONFIG = {
    CACHE_CHECK_INTERVAL: 5000, // Check cache every 5 seconds
    DATA_WAIT_TIMEOUT: 1500,    // Wait max 1.5 seconds for data
};
