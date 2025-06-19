const backendUrl = 'https://sdonrw-production.up.railway.app';
const applicationAddress = '0xb37bF0176558B9e76507b79d38D4696DD1805bee';
const usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

let provider;
let signer;

async function connectWallet() {
    if (window.ethereum) {
        try {
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x2105',
                    chainName: 'Base Mainnet',
                    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                    rpcUrls: ['https://mainnet.base.org'],
                    blockExplorerUrls: ['https://basescan.org']
                }]
            });
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            const address = await signer.getAddress();
            document.getElementById('walletAddress').textContent = address;
        } catch (error) {
            console.error('Wallet connection error:', error);
            alert('Unable to connect wallet. Please ensure your wallet supports Base network.');
        }
    } else {
        alert('Please install MetaMask or another wallet supporting Base network.');
    }
}

async function placeBet() {
    if (!signer) {
        alert('Please connect your wallet first');
        return;
    }
    const betAmount = document.getElementById('betAmount').value;
    const numbers = document.getElementById('numbers').value;
    if (!betAmount || !numbers) {
        alert('Please enter bet amount and numbers');
        return;
    }
    const numbersArray = numbers.split(',').map(num => num.trim());
    if (numbersArray.some(num => !/^\d{2}$/.test(num))) {
        alert('Numbers must be two digits, separated by commas');
        return;
    }
    const totalPositions = numbersArray.length;
    const totalCost = (parseFloat(betAmount) * totalPositions) + 0.10;
    document.getElementById('totalCost').textContent = totalCost.toFixed(2) + ' USDC';
    if (!confirm(`Total cost: ${totalCost.toFixed(2)} USDC. Continue?`)) {
        return;
    }
    const usdcContract = new ethers.Contract(usdcContractAddress, [
        'function transfer(address to, uint256 amount) public returns (bool)'
    ], signer);
    const amountInUnits = ethers.utils.parseUnits(totalCost.toString(), 6);
    try {
        const tx = await usdcContract.transfer(applicationAddress, amountInUnits);
        await tx.wait();
        console.log('Transaction successful:', tx.hash);
        const response = await fetch(`${backendUrl}/bets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                walletAddress: await signer.getAddress(),
                numbers: numbers,
                amountPerPosition: betAmount,
                txHash: tx.hash
            })
        });
        const data = await response.json();
        console.log('Bet recorded:', data);
        alert('Bet placed successfully');
    } catch (error) {
        console.error('Bet placement error:', error);
        alert('Unable to place bet');
    }
}

async function donate() {
    if (!signer) {
        alert('Please connect your wallet first');
        return;
    }
    const donationAmount = document.getElementById('donationAmount').value;
    if (!donationAmount) {
        alert('Please enter donation amount');
        return;
    }
    const usdcContract = new ethers.Contract(usdcContractAddress, [
        'function transfer(address to, uint256 amount) public returns (bool)'
    ], signer);
    const amountInUnits = ethers.utils.parseUnits(donationAmount, 6);
    try {
        const tx = await usdcContract.transfer(applicationAddress, amountInUnits);
        await tx.wait();
        console.log('Donation successful:', tx.hash);
        alert('Thank you for your donation');
    } catch (error) {
        console.error('Donation error:', error);
        alert('Unable to donate');
    }
}

async function displayResults(date) {
    try {
        const response = await fetch(`${backendUrl}/results?date=${date}`);
        const data = await response.json();
        if (data.winningNumbers) {
            const numbers = data.winningNumbers.split(',');
            for (let i = 0; i < 5; i++) {
                document.getElementById(`result${i+1}`).textContent = numbers[i] || '--';
            }
        } else {
            for (let i = 1; i <= 5; i++) {
                document.getElementById(`result${i}`).textContent = '--';
            }
        }
    } catch (error) {
        console.error('Error fetching results:', error);
    }
}

async function displayStats(date) {
    try {
        const response = await fetch(`${backendUrl}/stats?date=${date}`);
        const data = await response.json();
        document.getElementById('totalBets').textContent = data.totalBets + ' USDC';
        document.getElementById('ticketsSold').textContent = data.ticketsSold;
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
}

async function displayRecentWinners() {
    try {
        const response = await fetch(`${backendUrl}/recent-winners`);
        const data = await response.json();
        const winnersList = document.getElementById('recentWinners');
        winnersList.innerHTML = '';
        if (data.length === 0) {
            winnersList.innerHTML = '<li>None yet</li>';
        } else {
            data.forEach(winner => {
                const li = document.createElement('li');
                li.textContent = `${winner.walletAddress} won ${winner.payout} USDC on ${winner.date}`;
                winnersList.appendChild(li);
            });
        }
    } catch (error) {
        console.error('Error fetching recent winners:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    document.getElementById('placeBet').addEventListener('click', placeBet);
    document.getElementById('donate').addEventListener('click', donate);
    document.getElementById('fetchResults').addEventListener('click', () => {
        const date = document.getElementById('resultDate').value;
        if (date) {
            displayResults(date);
            displayStats(date);
        } else {
            alert('Please select a date');
        }
    });
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('resultDate').value = today;
    displayResults(today);
    displayStats(today);
    displayRecentWinners();
});