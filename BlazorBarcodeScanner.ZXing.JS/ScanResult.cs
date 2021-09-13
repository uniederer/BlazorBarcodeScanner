using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BlazorBarcodeScanner.ZXing.JS
{
    public class ScanResult
    {
        private static readonly Dictionary<string, JsonElement> EMPTY_EXTRAS  = new Dictionary<string, JsonElement>();

        public string Type { get; set; }

        public string Content { get; set; }

        [JsonExtensionData]
        public Dictionary<string, JsonElement> ExtensionData { get; set; } = EMPTY_EXTRAS;
    }
}
