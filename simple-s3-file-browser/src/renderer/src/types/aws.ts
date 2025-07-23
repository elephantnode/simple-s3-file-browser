// AWS認証情報とS3関連の型定義

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
}

export interface S3Object {
  key: string
  size: number
  lastModified: Date
  etag: string
  storageClass?: string
}

export interface S3ListResult {
  objects: S3Object[]
  commonPrefixes: string[]
  isTruncated: boolean
  continuationToken?: string
}

// AWS利用可能リージョン
export const AWS_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' }
] as const

export type AwsRegion = (typeof AWS_REGIONS)[number]['value']
