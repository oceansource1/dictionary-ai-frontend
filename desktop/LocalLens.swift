import Cocoa
import UniformTypeIdentifiers
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate,
    WKScriptMessageHandler
{
    var window: NSWindow!
    var web: WKWebView!
    var backend: Process?
    var capture: Process?
    var quitting = false
    let address = URL(string: "http://127.0.0.1:3219")!
    var ready = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appItem.submenu = appMenu
        appMenu.addItem(
            withTitle: "关于 Local Lens",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(
            withTitle: "退出 Local Lens", action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q")
        let edit = NSMenuItem()
        menu.addItem(edit)
        edit.submenu = NSMenu(title: "编辑")
        for (name, action, key) in [
            ("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"),
            ("全选", "selectAll:", "a"),
        ] {
            edit.submenu?.addItem(withTitle: name, action: Selector(action), keyEquivalent: key)
        }
        NSApp.mainMenu = menu
        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "capture")
        config.userContentController.add(self, name: "copy")
        config.userContentController.add(self, name: "importModel")
        config.websiteDataStore = .default()
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1160, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered,
            defer: false)
        window.title = "Local Lens · 本地智能工作台"
        window.minSize = NSSize(width: 780, height: 600)
        window.contentView = web
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        web.loadHTMLString(
            "<html><meta charset='utf-8'><body style='background:#f0f3ec;color:#294e3e;font:18px -apple-system;padding:70px'><h1>Local Lens</h1><p>正在启动本地智能工作台…</p></body></html>",
            baseURL: nil)
        startBackend()
    }
    func startBackend() {
        guard let resource = Bundle.main.resourceURL else { return }
        let p = Process()
        backend = p
        p.executableURL = resource.appendingPathComponent("node")
        p.arguments = [resource.appendingPathComponent("server.mjs").path]
        var env = ProcessInfo.processInfo.environment
        env["PORT"] = "3219"
        env["LOCAL_LENS_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        p.environment = env
        let output = Pipe()
        p.standardOutput = output
        p.standardError = output
        output.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            if String(decoding: data, as: UTF8.self).contains("Local Lens 已启动") {
                DispatchQueue.main.async {
                    self.ready = true
                    self.web.load(URLRequest(url: self.address))
                }
            }
        }
        p.terminationHandler = { process in
            DispatchQueue.main.async {
                if !self.quitting {
                    self.alert(
                        "本地服务已停止",
                        "请退出后重新打开应用。如果仍无法启动，请确认 3219 端口未被其他程序占用。退出码：\(process.terminationStatus)",
                        fatal: true)
                }
            }
        }
        do { try p.run() } catch { alert("启动失败", error.localizedDescription, fatal: true) }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) {
            if !self.ready && !self.quitting {
                self.alert("服务启动超时", "请退出后重新打开 Local Lens。", fatal: true)
            }
        }
    }
    func alert(_ title: String, _ message: String, fatal: Bool) {
        let a = NSAlert()
        a.messageText = title
        a.informativeText = message
        a.runModal()
        if fatal { NSApp.terminate(nil) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        quitting = true
        if let p = backend, p.isRunning { p.terminate() }
        if let p = capture, p.isRunning { p.terminate() }
    }
    func webView(
        _ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "about"
            || (url.host == address.host && url.port == address.port && url.scheme == "http")
        {
            decisionHandler(.allow)
        } else {
            if ["https", "http"].contains(url.scheme ?? "")
                && navigationAction.navigationType == .linkActivated
            {
                NSWorkspace.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
    func webView(
        _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.png, .jpeg, .webP]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }
    func userContentController(
        _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.host == address.host,
            message.frameInfo.request.url?.port == address.port
        else { return }
        if message.name == "copy", let text = message.body as? String {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            return
        }
        if message.name == "importModel" {
            let panel = NSOpenPanel()
            panel.allowedContentTypes = [UTType(filenameExtension: "gguf") ?? .data]
            panel.allowsMultipleSelection = true
            panel.canChooseDirectories = false
            panel.message = "选择一个 GGUF 主模型。视觉模型请同时选择配套的 mmproj 文件（按住 ⌘ 多选）。仅记录文件位置，不复制模型。"
            panel.beginSheetModal(for: window) { response in
                guard response == .OK else { return }
                let value = ["paths": panel.urls.map { $0.path }]
                if let json = try? JSONSerialization.data(withJSONObject: value),
                    let text = String(data: json, encoding: .utf8)
                {
                    self.web.evaluateJavaScript(
                        "window.dispatchEvent(new CustomEvent('native-model-import', {detail: \(text)}))",
                        completionHandler: nil)
                }
            }
            return
        }
        guard message.name == "capture", capture == nil else { return }
        let captureTarget =
            (message.body as? [String: Any])?["target"] as? String == "dictionary"
            ? "dictionary" : "chat"
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(
            "local-lens-\(UUID().uuidString).png")
        let p = Process()
        capture = p
        p.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        p.arguments = ["-i", "-x", file.path]
        p.terminationHandler = { _ in
            let data = try? Data(contentsOf: file)
            try? FileManager.default.removeItem(at: file)
            DispatchQueue.main.async {
                self.capture = nil
                NSApp.unhide(nil)
                self.window.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
                var value: [String: String] =
                    data.map { ["image": $0.base64EncodedString()] } ?? [
                        "error": "截图已取消或未获屏幕录制权限。可在系统设置 → 隐私与安全性 → 屏幕录制中授权 Local Lens。"
                    ]
                value["target"] = captureTarget
                if let json = try? JSONSerialization.data(withJSONObject: value),
                    let text = String(data: json, encoding: .utf8)
                {
                    self.web.evaluateJavaScript(
                        "window.dispatchEvent(new CustomEvent('native-capture', {detail: \(text)}))",
                        completionHandler: nil)
                }
            }
        }
        NSApp.hide(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            do { try p.run() } catch {
                self.capture = nil
                NSApp.unhide(nil)
                self.alert("截图失败", error.localizedDescription, fatal: false)
            }
        }
    }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
