using Microsoft.JSInterop;
using System;
using System.Linq;

namespace BlazorBarcodeScanner.ZXing.JS
{
    /// <summary>
    /// Unfortunately JS is unable to invoke public methods of internal classes. Thus 
    /// we route the call to the internal class at this point.This allows us to hide away
    /// the rest of the interop from the component's client. 
    /// </summary>
    public class JsInteropClass
    {
        [JSInvokable]
        public static void ReceiveBarcode(ScanResult result)
        {
            BarcodeReaderInterop.OnBarcodeReceived(result);
        }

        [JSInvokable]
        public static void ReceiveError(object error)
        {
            // What to do with the knowledge that an error happened?
            // Looking at current examples this might indicate issues with one of the decoders
            // (namely BrowserQRCodeReader appears to throw errors occasionally...)
        }

        [JSInvokable]
        public static void ReceiveNotFound()
        {
            BarcodeReaderInterop.OnNotFoundReceived();
        }
    }
}
