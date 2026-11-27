// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Countdown",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Countdown",
            path: "Sources/Countdown"
        )
    ]
)
