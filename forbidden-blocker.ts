import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs/promises"
import path from "path"
import { minimatch } from "minimatch"

let forbiddenPatterns: string[] | null = null

async function loadForbiddenList(projectRoot: string): Promise<string[]> {
    if (forbiddenPatterns !== null) return forbiddenPatterns

    const configPath = path.join(projectRoot, ".opencode", "forbidden.json")
    try {
        const content = await fs.readFile(configPath, "utf-8")
        const parsed = JSON.parse(content)
        if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) {
            forbiddenPatterns = parsed
            return forbiddenPatterns
        }
        console.warn("⚠️ forbidden.json 格式错误（应为字符串数组），使用默认规则")
        forbiddenPatterns = ["**/.env", "**/.env.*"]
        return forbiddenPatterns
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            console.log("ℹ️ 未找到 .opencode/forbidden.json，使用默认规则（.env 文件）")
            forbiddenPatterns = ["**/.env", "**/.env.*"]
            return forbiddenPatterns
        }
        throw error
    }
}

function isForbidden(filePath: string, patterns: string[], projectRoot: string): boolean {
    const absolute = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath)
    const relative = path.relative(projectRoot, absolute)
    const normalized = relative.split(path.sep).join("/")
    return patterns.some(pattern => minimatch(normalized, pattern, { dot: true }))
}

export const EnvProtection: Plugin = async () => {
    const projectRoot = process.cwd()
    console.log(`🔒 文件保护插件已激活，项目根目录：${projectRoot}`)

    // 直接返回钩子对象（而不是嵌套在 hooks 属性下）
    return {
        "tool.execute.before": async (input: any) => {
            const fileTools = ["read", "edit", "write", "delete"]
            if (!fileTools.includes(input.tool)) return

            const filePath = input.args?.filePath || input.args?.path || input.args?.target
            if (!filePath) return

            const patterns = await loadForbiddenList(projectRoot)
            if (isForbidden(filePath, patterns, projectRoot)) {
                throw new Error(`❌ 禁止 ${input.tool} 操作 "${filePath}"（匹配禁止列表）`)
            }
        },
    }
}