import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

void main() {
  runApp(const GameHubApp());
}

class GameHubApp extends StatelessWidget {
  const GameHubApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Game Hub',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const GameHubWebView(),
    );
  }
}

class GameHubWebView extends StatefulWidget {
  const GameHubWebView({super.key});

  @override
  State<GameHubWebView> createState() => _GameHubWebViewState();
}

class _GameHubWebViewState extends State<GameHubWebView> {
  late final WebViewController _controller;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() {
            _isLoading = true;
            _error = null;
          }),
          onPageFinished: (_) => setState(() => _isLoading = false),
          onWebResourceError: (error) => setState(() {
            _isLoading = false;
            _error = error.description;
          }),
        ),
      )
      ..addJavaScriptChannel(
        'GameHubBridge',
        onMessageReceived: _handleJavaScriptMessage,
      )
      ..loadFlutterAsset('assets/index.html');
  }

  void _handleJavaScriptMessage(JavaScriptMessage message) {
    debugPrint('GameHubBridge: ${message.message}');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_isLoading)
            const Center(
              child: CircularProgressIndicator(
                valueColor: AlwaysStoppedAnimation<Color>(Colors.blue),
              ),
            ),
          if (_error != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.error_outline,
                      color: Colors.red,
                      size: 48,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Failed to load Game Hub',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () {
                        setState(() {
                          _error = null;
                          _isLoading = true;
                        });
                        _controller.loadFlutterAsset('assets/index.html');
                      },
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}