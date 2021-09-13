using System;
using System.Linq;

namespace BlazorBarcodeScanner.ZXing.JS
{
    public class DecodingChangedArgs
    {
        public BarcodeReader Sender;
        public bool IsDecoding;
    }
}
