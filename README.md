# winston-cloudwatch-logs

Send logs to Amazon Cloudwatch Logs using [Winston](https://github.com/winstonjs/winston).

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Considerations](#considerations)
- [AWS IAM Permissions](#aws-iam-permissions)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Automatic Log Stream Management:** Creates new log streams based on the current UTC date and hour, prefixed by your `logStreamNamePrefix`. This helps organize logs chronologically.
- **Efficient Batching:** Log messages are intelligently batched to optimize API calls to CloudWatch Logs, respecting AWS limits for batch size (1MB) and event count (10,000 events).
- **Configurable Flush Interval:** Control how frequently logs are sent to CloudWatch Logs via the `flushInterval` option (defaults to 3 seconds).
- **Automatic Message Truncation:** If an individual log message exceeds CloudWatch's per-event size limit (approximately 1MB, minus overhead), it's automatically truncated with a `[TRUNCATED]` suffix to prevent errors.
- **Seamless Winston Integration:** Designed as a standard Winston transport stream for easy integration into existing Winston logging setups.
- **Modern AWS SDK:** Utilizes the modular AWS SDK v3 (`@aws-sdk/client-cloudwatch-logs`).
- **Asynchronous Operations:** All logging and flushing operations are non-blocking, ensuring your application's performance is not impacted.

## Installation

```bash
pnpm add @hirotoshioi/winston-cloudwatchlogs winston @aws-sdk/client-cloudwatch-logs
# or
yarn add @hirotoshioi/winston-cloudwatchlogs winston @aws-sdk/client-cloudwatch-logs
# or
npm install @hirotoshioi/winston-cloudwatchlogs winston @aws-sdk/client-cloudwatch-logs
# or
bun add @hirotoshioi/winston-cloudwatchlogs winston @aws-sdk/client-cloudwatch-logs
```

## Usage

```typescript
import winston from "winston";
import { CloudWatchLogsTransportStream } from "winston-cloudwatchlogs";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

async function main() {
  const logger = winston.createLogger({
    transports: [
      await CloudWatchLogsTransportStream.create({
        logGroupName: "your-log-group",
        logStreamNamePrefix: "your-app-prefix",
        cloudWatchLogsClientConfig: {
          region: "your-aws-region",
          credentials: {
            accessKeyId: "YOUR_AWS_ACCESS_KEY_ID",
            secretAccessKey: "YOUR_AWS_SECRET_ACCESS_KEY",
          },
        },
        flushInterval: 5000,
      }),
    ],
  });

  logger.info("Hello from winston-cloudwatchlogs!");
}

main().catch(console.error);
```

## Considerations

- **IAM Permissions:** Ensure the AWS identity (user or role) running your application has the necessary IAM permissions. Refer to the "AWS IAM Permissions" section below for details.
- **AWS Credentials Configuration:** Credentials must be correctly configured for the AWS SDK. This can be done via the `cloudWatchLogsClientConfig` option, or through standard AWS mechanisms like environment variables (e.g., `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`), shared credential files (`~/.aws/credentials`), or IAM roles if running on AWS services (e.g., EC2, ECS, Lambda).
- **Log Group Existence:** This transport assumes the specified `logGroupName` already exists. While the IAM permission `logs:CreateLogGroup` is recommended (see below), the transport itself does not explicitly create the log group if it's missing.

## AWS IAM Permissions

To allow your application to send logs to CloudWatch, the AWS IAM role or user associated with your application needs the following permissions. You can attach this policy to the relevant IAM identity.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:DescribeLogStreams",
        "logs:PutLogEvents"
      ],
      "Resource": ["*"]
    }
  ]
}
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT
