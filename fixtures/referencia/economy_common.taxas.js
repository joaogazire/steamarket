
function ToValidMarketPrice( nPrice, rgWallet )
{
	var nFloor = parseInt( rgWallet[ 'wallet_market_minimum' ] ?? 1 );
	var nIncrement = parseInt( rgWallet[ 'wallet_currency_increment' ] ?? 1 );

	if ( nPrice <= nFloor )
	{
		return nFloor;
	}
	if ( nPrice <= nIncrement )
	{
		return nIncrement;
	}
	if ( nIncrement > 1 )
	{
		var dAmount = nPrice / nIncrement;
		var dSign = dAmount < 0 ? -1 : 1;
		dAmount = (dSign * Math.floor(Math.abs(dAmount) + 0.5)) * nIncrement;
		return dAmount;
	}
	return nPrice;
}


function CalculateFee( base_amt, pct, rgWallet )
{
	if ( pct > 0 )
	{
		return ToValidMarketPrice( Math.floor( base_amt * pct ), rgWallet );
	}
	return 0;
}

function GetTotalWithFees( base_amt, ppct, spct, rgWallet )
{
	var nBase = ToValidMarketPrice( base_amt, rgWallet );
	var nPubFee = CalculateFee( base_amt, ppct, rgWallet );
	var nSteamFee = CalculateFee( base_amt, spct, rgWallet );
	return nBase + nPubFee + nSteamFee;
}

function GetItemPriceFromTotal( nTotal, rgWallet )
{
		var ppct = parseFloat( rgWallet[ 'wallet_publisher_fee_percent_default' ] ?? 0.10 );
	var spct = parseFloat( rgWallet[ 'wallet_fee_percent' ] ?? 0.05 );
	var nIncrement = parseInt( rgWallet[ 'wallet_currency_increment' ] ?? 1 );
	var nFloor = parseInt( rgWallet[ 'wallet_market_minimum' ] ?? 1 );

	var nInitialGuess = Math.floor( nTotal / ( 1.0 + ppct + spct )  );
	var nMaxBase = nTotal - (2 * nFloor );

	// we are at or under the right guess now
	var nBase = ToValidMarketPrice( Math.min( nInitialGuess, nMaxBase ), rgWallet );

	for ( var i = 0; i < 3; i ++ )
	{
		var nCalculated = GetTotalWithFees( nBase, ppct, spct, rgWallet );
		if ( nCalculated == nTotal )
		{
			return nBase;
		}
		if ( nCalculated < nTotal )
		{
			nBase += nIncrement;
		}
		else
		{
			nBase -= nIncrement;
			break;
		}
	}

	return Math.max( nFloor, nBase );
}
