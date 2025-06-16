// Configuration
    const backendUrl = '[your-backend-url]'; // Replace with your Heroku URL
    const applicationAddress = 'your-application-wallet-address'; // Replace with your Base wallet address
    const usdcContractAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

    // Wallet connection
    let provider;
    let signer;
    let isConnected = false;

    // Connect Wallet
    async function connectWallet() {
        console.log('Attempting to connect wallet');
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
                console.log('Wallet connected:', address);
                isConnected = true;
                const connectButton = document.getElementById('connectWallet');
                const betFormContainer = document.getElementById('betFormContainer');
                if (!connectButton || !betFormContainer) {
                    console.error('Elements not found:', { connectButton, betFormContainer });
                    alert('UI elements not found');
                    return;
                }
                console.log('Updating UI');
                connectButton.textContent = 'Disconnect Wallet';
                betFormContainer.style.display = 'block';
                console.log('UI updated');
            } catch (error) {
                console.error('Wallet connection error:', error);
                alert('Cannot connect wallet');
            }
        } else {
            console.error('No Ethereum provider found');
            alert('Please install MetaMask or another wallet.');
        }
    }

    // Disconnect Wallet
    function disconnectWallet() {
        console.log('Disconnecting wallet');
        provider = null;
        signer = null;
        isConnected = false;
        const connectButton = document.getElementById('connectWallet');
        const betFormContainer = document.getElementById('betFormContainer');
        if (!connectButton || !betFormContainer) {
            console.error('Elements not found:', { connectButton, betFormContainer });
            alert('UI elements not found');
            return;
        }
        connectButton.textContent = 'Connect Wallet';
        betFormContainer.style.display = 'none';
        console.log('Wallet disconnected, UI updated');
    }

    // Elements for bet form
    const betAmountInput = document.getElementById('betAmount');
    const numbersInput = document.getElementById('numbers');
    const totalCostSpan = document.getElementById('totalCost');

    // Function to calculate total cost
    function calculateTotalCost() {
        const betAmount = parseFloat(betAmountInput.value) || 0;
        const numbers = numbersInput.value.split(',').filter(num => num.trim() !== '');
        const numPositions = numbers.length;
        const fixedFee = 0.10;
        const totalCost = (betAmount * numPositions) + fixedFee;
        totalCostSpan.textContent = totalCost.toFixed(2);
    }

    // Add event listeners to update total cost
    betAmountInput.addEventListener('input', calculateTotalCost);
    numbersInput.addEventListener('input', calculateTotalCost);

    // Place Bet
    async function placeBet(event) {
        event.preventDefault();
        if (!signer) {
            alert('Please connect wallet first');
            return;
        }
        const betAmount = betAmountInput.value;
        const numbers = numbersInput.value;
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
        const totalCost = (parseFloat(betAmount) * totalPositions) + 0.10; // Fixed fee
        if (!confirm(`Total cost: ${totalCost.toFixed(2)} USDC. Proceed?`)) {
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
            alert('Cannot place bet');
        }
    }

    // Donate
    async function donate(event) {
        event.preventDefault();
        if (!signer) {
            alert('Please connect wallet first');
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
            alert('Cannot donate');
        }
    }

    // Display results
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

    // Display stats
    async function displayStats(date) {
        try {
            const response = await fetch(`${backendUrl}/stats?date=${date}`);
            const data = await response.json();
            document.getElementById('totalBets').textContent = data.totalBets;
            document.getElementById('ticketsSold').textContent = data.ticketsSold;
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    }

    // Display recent winners
    async function displayRecentWinners() {
        try {
            const response = await fetch(`${backendUrl}/recent-winners`);
            const data = await response.json();
            const winnersList = document.getElementById('recentWinners');
            winnersList.innerHTML = '';
            if (data.length === 0) {
                winnersList.innerHTML = '<li>None</li>';
            } else {
                data.forEach(winner => {
                    const li = document.createElement('li');
                    li.textContent = `${winner.walletAddress} won ${winner.payout} USDC on ${winner.date}`;
                    winnersList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Error fetching winners:', error);
        }
    }

    // Event listeners
    document.addEventListener('DOMContentLoaded', () => {
        const connectButton = document.getElementById('connectWallet');
        if (!connectButton) {
            console.error('Connect Wallet button not found');
            alert('Connect Wallet button not found');
            return;
        }
        connectButton.addEventListener('click', async function() {
            if (isConnected) {
                disconnectWallet();
            } else {
                await connectWallet();
            }
        });
        document.getElementById('betForm').addEventListener('submit', placeBet);
        document.getElementById('donationForm').addEventListener('submit', donate);
        const today = new Date().toISOString().split('T')[0];
        displayResults(today);
        displayStats(today);
        displayRecentWinners();
    });