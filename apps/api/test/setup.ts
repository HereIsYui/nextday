// 测试环境显式开启商业化模拟，并使用固定开发令牌；生产环境不会加载该文件。
process.env.COMMERCE_MOCK_ENABLED = process.env.COMMERCE_MOCK_ENABLED ?? "true";
process.env.COMMERCE_MOCK_TOKEN = process.env.COMMERCE_MOCK_TOKEN ?? "nextday-commerce-test";
