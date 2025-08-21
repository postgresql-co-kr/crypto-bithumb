# 빗썸 실시간 암호화폐 시세 표시기

[![NPM Version](https://img.shields.io/npm/v/@debate300/bithumb.svg)](https://www.npmjs.com/package/@debate300/bithumb)
[![NPM Downloads](https://img.shields.io/npm/dm/@debate300/bithumb.svg)](https://www.npmjs.com/package/@debate300/bithumb)

빗썸 거래소의 암호화폐 시세를 터미널에 실시간으로 표시하는 커맨드 라인 인터페이스(CLI) 애플리케이션입니다.

## Install

```bash
npm i -g @debate300/bithumb
```

## 간편 설치 가이드 (Quick Start)

터미널 사용에 익숙한 분들을 위한 빠른 설치 과정입니다.

1.  **Node.js 설치**: [Node.js 공식 웹사이트](https://nodejs.org/ko/download)에서 LTS 버전을 다운로드하여 설치합니다. 이미 설치되어 있다면 이 단계를 건너뛰세요.

2.  **패키지 전역 설치**: 터미널을 열고 다음 명령어를 실행하여 패키지를 전역으로 설치합니다.

    ```bash
    npm install -g @debate300/bithumb
    ```

3.  **`config.json` 파일 확인 및 수정**:
    `@debate300/bithumb`을 처음 실행하면, 사용자 홈 디렉토리에 기본 설정 파일이 자동으로 생성됩니다.

    - **파일 위치**: `~/.debate300/config.json` (macOS/Linux) 또는 `C:\Users\YOUR_USERNAME\.debate300\config.json` (Windows)
    - **기본 설정**: 시가총액 상위 30개 코인이 기본으로 포함되어 있습니다.

    **원하는 코인 목록으로 변경하려면** 이 파일을 직접 열어 `coins` 배열을 아래와 같이 수정하세요.

    **예시 `config.json`:**

    ```json
    {
      "coins": [
        {
          "symbol": "BTC",
          "icon": "₿",
          "averagePurchasePrice": 90000000,
          "unit_currency": "KRW"
        },
        {
          "symbol": "ETH",
          "icon": "Ξ",
          "averagePurchasePrice": 4600000,
          "unit_currency": "KRW"
        },
        {
          "symbol": "XRP",
          "icon": "✕",
          "averagePurchasePrice": 0,
          "unit_currency": "KRW"
        }
      ]
    }
    ```

    `symbol`(코인 심볼), `icon`(아이콘), `averagePurchasePrice`(평균 매수 단가), `unit_currency`(기준 통화)를 자유롭게 변경, 추가 또는 삭제할 수 있습니다.

    **참고**: 현재 작업 디렉토리에 `config.json` 파일을 두면, 홈 디렉토리의 설정보다 우선적으로 사용됩니다.

4.  **실행**: 터미널에 다음 명령어를 입력하여 애플리케이션을 실행합니다.
    ```bash
    debate300
    ```

## 주요 기능

- **실시간 시세 추적**: 웹소켓을 통해 빗썸의 암호화폐 데이터를 실시간으로 가져와 표시합니다.
- **한글 코인 이름 지원**: API를 통해 코인의 한글 이름을 가져와 심볼과 함께 표시합니다.
- **사용자 정의 코인 목록**: `config.json` 파일을 통해 추적할 코인을 쉽게 설정할 수 있습니다.
- **수익률 계산**: `config.json`에 입력된 평균 매수 단가에 기반하여 실시간 수익률을 계산하고 표시합니다.
- **시장 분위기 분석**: 추적 중인 코인들의 전반적인 등락률을 기반으로 시장의 흐름(상승, 하락, 보합)을 보여줍니다.
- **다양한 정렬 및 필터링**: 변동률, 이름순으로 정렬하거나 표시할 코인의 개수를 지정할 수 있습니다.

---

## 사전 요구사항 (Prerequisites)

이 애플리케이션을 실행하려면 [Node.js](https://nodejs.org/) (버전 18.x 이상 권장)가 시스템에 설치되어 있어야 합니다. Node.js를 설치하면 `npm`과 `npx`가 함께 설치됩니다.

아래에서 사용 중인 운영체제에 맞는 가장 쉬운 설치 방법을 확인하세요.

### Windows

[Node.js 공식 웹사이트](https://nodejs.org/ko/download)에서 Windows용 LTS 버전 설치 프로그램을 다운로드하여 설치하는 것이 가장 쉽습니다.

또는, [Chocolatey](https://chocolatey.org/) 패키지 관리자를 사용할 수 있습니다.

```powershell
# Chocolatey가 설치되어 있지 않다면 먼저 설치합니다.
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Chocolatey를 이용해 Node.js를 설치합니다.
choco install nodejs-lts
```

### macOS

[Homebrew](https://brew.sh/)를 사용하는 것이 가장 간편합니다.

```bash
# Homebrew가 설치되어 있지 않다면 먼저 설치합니다.
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Homebrew를 이용해 Node.js를 설치합니다.
brew install node
```

또는, Node.js 버전 관리자인 `nvm`을 설치하여 사용하는 것을 권장합니다.

```bash
# nvm 설치 스크립트를 실행합니다.
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# nvm을 사용하여 Node.js 최신 LTS 버전을 설치합니다.
nvm install --lts
```

### Linux

대부분의 Linux 배포판에서는 패키지 관리자를 통해 Node.js를 설치할 수 있습니다. 하지만 최신 버전을 사용하기 위해 [NodeSource](https://github.com/nodesource/distributions) 저장소를 추가하는 것이 좋습니다.

**Debian/Ubuntu 기반 시스템:**

```bash
# NodeSource 저장소를 추가하고 Node.js를 설치합니다.
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Fedora/RHEL/CentOS 기반 시스템:**

```bash
# NodeSource 저장소를 추가하고 Node.js를 설치합니다.
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs
```

---

## 시작하기 (초보자용)

이 애플리케이션은 `npx` 또는 전역 설치를 통해 쉽게 실행할 수 있습니다.

### 1. `config.json` 파일 설정

`@debate300/bithumb`은 `config.json` 파일을 통해 추적할 코인을 설정합니다.

**자동 생성 및 위치**:
처음 실행 시, 시가총액 상위 30개 코인이 포함된 `config.json` 파일이 아래 경로에 자동으로 생성됩니다.

- **macOS/Linux**: `~/.debate300/config.json`
- **Windows**: `C:\Users\YOUR_USERNAME\.debate300\config.json`

**직접 설정 및 샘플**:
필요시, 아래 샘플과 같이 `config.json` 파일을 직접 생성하거나 자동 생성된 파일을 수정하여 원하는 코인을 추적할 수 있습니다. 현재 작업 디렉토리에 `config.json`이 있으면 전역 설정보다 우선 적용됩니다.

**샘플 `config.json`:**

```json
{
  "coins": [
    {
      "symbol": "BTC",
      "icon": "₿",
      "averagePurchasePrice": 90000000,
      "unit_currency": "KRW"
    },
    {
      "symbol": "ETH",
      "icon": "Ξ",
      "averagePurchasePrice": 4600000,
      "unit_currency": "KRW"
    },
    {
      "symbol": "XRP",
      "icon": "✕",
      "averagePurchasePrice": 0,
      "unit_currency": "KRW"
    }
  ]
}
```

- `symbol`: **(필수)** 코인 심볼 (대문자, 예: "BTC")
- `icon`: 표시될 아이콘 (이모지 등)
- `averagePurchasePrice`: 평균 매수 단가. 수익률 계산에 사용되며, 원치 않으면 `0`으로 설정합니다.
- `unit_currency`: 기준 통화 (현재 "KRW"만 지원)

### 2. 애플리케이션 실행

`config.json` 파일을 설정했다면, 이제 `debate300`을 실행할 수 있습니다.

#### 전역 설치 후 실행

`debate300` 명령어를 터미널 어디서든 사용하고 싶다면, 전역으로 설치할 수 있습니다.

```bash
npm install -g @debate300/bithumb
```

설치 후에는 다음 명령어로 실행하세요:

```bash
debate300
```

---

### 실행 옵션

커맨드 라인 인수를 통해 테이블의 정렬 순서와 표시 개수를 변경할 수 있습니다.

- `--sort-by`: 정렬 기준을 선택합니다.

  - `rate` (기본값): 등락률 기준 내림차순 정렬.
    ```bash
    npx @debate300/bithumb --sort-by rate
    # 또는 전역 설치 시:
    # debate300 --sort-by rate
    ```
  - `name`: 코인 이름(심볼) 기준 오름차순 정렬.
    ```bash
    npx @debate300/bithumb --sort-by name
    # 또는 전역 설치 시:
    # debate300 --sort-by name
    ```

- `--limit`: 표시할 코인의 최대 개수를 지정합니다.

  - 예시: 상위 10개만 표시
    ```bash
    npx @debate300/bithumb --limit 10
    # 또는 전역 설치 시:
    # debate300 --limit 10
    ```

- **옵션 조합:**
  ```bash
  npx @debate300/bithumb --sort-by name --limit 15
  # 또는 전역 설치 시:
  # debate300 --sort-by name --limit 15
  ```
- 애플리케이션을 종료하려면 `Ctrl+C`를 누르세요.

---

## 출력 예시

Bithumb 실시간 시세 (Ctrl+C to exit) - Debate300.com

> 전체 시장: 상승세 📈 | 체결강도: 105.12

| 코인           | 현재가         | 체결강도 | 수익률 | 전일대비 | 전일대비금액   | 시가       | 고가       | 저가       |
| :------------- | :------------- | :------- | :----- | :------- | :------------- | :--------- | :--------- | :--------- |
| ₿ BTC 비트코인 | 91,123,000 KRW | 115.42   | +2.50% | +1.25%   | +1,123,000 KRW | 90,000,000 | 92,000,000 | 89,500,000 |
| Ξ ETH 이더리움 | 4,550,000 KRW  | 98.78    | -1.10% | -0.55%   | -25,000 KRW    | 4,575,000  | 4,600,000  | 4,500,000  |
| ✕ XRP 리플     | 720 KRW        | 89.30    | -      | -2.70%   | -20 KRW        | 740        | 745        | 715        |

## 라이선스

이 프로젝트는 ISC 라이선스를 따릅니다.
